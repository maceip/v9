/**
 * AWS CDK stack for the hardened Wisp server.
 *
 * Deploys:
 *   1. ECR repo (holds the Docker image)
 *   2. App Runner service (runs the container, scales to zero)
 *   3. CloudFront distribution (TLS, custom domain, DDoS, global PoPs)
 *   4. AWS WAF (rate limiting + managed rules)
 *   5. ACM certificate (for the custom domain, us-east-1)
 *
 * Architecture:
 *
 *   browser
 *     │
 *     │ wss://fetch.stare.network/wisp/
 *     ▼
 *   CloudFront + WAF
 *     │ (origin: <id>.<region>.awsapprunner.com)
 *     │ (origin protocol: https-only)
 *     │ (WS upgrade pass-through)
 *     ▼
 *   App Runner service
 *     │ Docker image from ECR
 *     │ wisp-server-node running on port 8080
 *     ▼
 *   destination TCP (public internet, filtered by guard.js)
 *
 * Deploy:
 *   cd cmd/wisp-server-node/infra
 *   npm install
 *   npx cdk bootstrap           # once per account/region
 *   npx cdk deploy              # initial deploy (will log ECR URI)
 *   ../build-and-push.sh        # builds Docker image, pushes to ECR
 *   # then trigger a redeploy:
 *   aws apprunner start-deployment --service-arn $(aws apprunner \
 *     list-services --query \
 *     "ServiceSummaryList[?ServiceName=='wisp-server'].ServiceArn | [0]" \
 *     --output text)
 *
 * Cost (approximate):
 *   - App Runner 0.25 vCPU / 0.5 GB (~$5-15/mo)
 *   - CloudFront: first 1 TB/month free, then ~$0.085/GB
 *   - WAF: ~$5/mo base + $1/rule + $0.60/million requests
 *   - ACM cert: free
 *   Total idle: ~$10-15/mo. Under load: mostly bandwidth.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

interface WispStackProps extends cdk.StackProps {
  /**
   * Custom domain to serve the Wisp server on. The ACM cert will be created
   * in us-east-1 for CloudFront. You must own this DNS name and point it at
   * the CloudFront distribution after deploy.
   */
  domainName?: string;
  /**
   * Comma-separated list of origins allowed to open WebSocket sessions.
   * Passed to the server as WISP_ORIGIN_ALLOWLIST.
   */
  originAllowlist?: string;
  /**
   * Max concurrent WebSocket sessions per client IP.
   */
  maxSessionsPerIp?: number;
  /**
   * Bandwidth cap per session in bytes/second. 0 = unlimited.
   */
  bandwidthBps?: number;
}

export class WispServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WispStackProps = {}) {
    super(scope, id, props);

    const domain = props.domainName || '';
    const originAllowlist = props.originAllowlist || 'https://maceip.github.io';
    const maxSessionsPerIp = props.maxSessionsPerIp ?? 10;
    const bandwidthBps = props.bandwidthBps ?? 10 * 1024 * 1024;

    // ─── ECR repository ─────────────────────────────────────────────
    const repo = new ecr.Repository(this, 'WispEcr', {
      repositoryName: 'wisp-server-node',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
      lifecycleRules: [
        { maxImageCount: 10, description: 'Keep last 10 images' },
      ],
    });

    // ─── IAM roles for App Runner ───────────────────────────────────

    // Access role — App Runner needs this to pull from ECR
    const accessRole = new iam.Role(this, 'WispAppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess',
        ),
      ],
    });

    // Instance role — what the container itself runs as. Needs no AWS perms
    // (we only do outbound TCP) but App Runner requires the role to exist.
    const instanceRole = new iam.Role(this, 'WispAppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
    });

    // ─── App Runner service ─────────────────────────────────────────
    const appRunner = new apprunner.CfnService(this, 'WispAppRunner', {
      serviceName: 'wisp-server',
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        autoDeploymentsEnabled: false, // images pushed manually
        imageRepository: {
          imageIdentifier: `${repo.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8080',
            runtimeEnvironmentVariables: [
              { name: 'PORT', value: '8080' },
              { name: 'WISP_ORIGIN_ALLOWLIST', value: originAllowlist },
              { name: 'WISP_MAX_SESSIONS_PER_IP', value: String(maxSessionsPerIp) },
              { name: 'WISP_BANDWIDTH_BPS', value: String(bandwidthBps) },
              { name: 'WISP_STREAM_IDLE_MS', value: '60000' },
              { name: 'WISP_STREAM_MAX_LIFETIME_MS', value: '1800000' },
              { name: 'NODE_ENV', value: 'production' },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 3,
      },
    });

    // attrServiceUrl is the bare DNS name like "abcd.us-east-1.awsapprunner.com"
    // (no scheme). We use it directly as the CloudFront origin domain.
    const appRunnerDomain = appRunner.attrServiceUrl;

    // ─── WAF web ACL ────────────────────────────────────────────────
    // WAF for CloudFront must live in us-east-1. This stack's env.region
    // is set to us-east-1 below so the constraint is satisfied.
    const webAcl = new wafv2.CfnWebACL(this, 'WispWaf', {
      name: 'wisp-server-waf',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'wisp-waf',
      },
      rules: [
        {
          name: 'rate-limit-per-ip',
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000, // requests per 5 minutes per IP
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'rate-limit',
          },
        },
        {
          name: 'aws-managed-common',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'aws-common',
          },
        },
        {
          name: 'aws-managed-known-bad-inputs',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'aws-bad-inputs',
          },
        },
      ],
    });

    // ─── ACM certificate (us-east-1 for CloudFront) ─────────────────
    let certificate: acm.ICertificate | undefined;
    if (domain) {
      certificate = new acm.Certificate(this, 'WispCert', {
        domainName: domain,
        validation: acm.CertificateValidation.fromDns(),
      });
    }

    // ─── CloudFront distribution ────────────────────────────────────
    const origin = new origins.HttpOrigin(appRunnerDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      httpsPort: 443,
    });

    const distribution = new cloudfront.Distribution(this, 'WispCdn', {
      comment: 'v9 Wisp server — hosted TCP tunnel for GitHub Pages demo',
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // WebSocket-friendly: disable caching, forward all headers
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        compress: false,
      },
      domainNames: domain ? [domain] : undefined,
      certificate,
      webAclId: webAcl.attrArn,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, CA, EU (cheapest)
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // ─── Outputs ────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AppRunnerUrl', {
      value: appRunner.attrServiceUrl,
      description: 'Direct App Runner URL (origin)',
    });
    new cdk.CfnOutput(this, 'CloudFrontDomain', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain — point your custom DNS at this',
    });
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: repo.repositoryUri,
      description: 'Push Docker images here',
    });
    if (domain) {
      new cdk.CfnOutput(this, 'CustomDomain', {
        value: `https://${domain}/wisp/`,
        description: 'The public Wisp endpoint once DNS points at CloudFront',
      });
    }
  }
}

// ─── CDK app entry point ──────────────────────────────────────────────

const app = new cdk.App();

new WispServerStack(app, 'WispServerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // CloudFront + CloudFront-scoped WAF must live in us-east-1
    region: 'us-east-1',
  },
  domainName: process.env.WISP_DOMAIN_NAME || '',
  originAllowlist: process.env.WISP_ORIGIN_ALLOWLIST || 'https://maceip.github.io',
  maxSessionsPerIp: Number(process.env.WISP_MAX_SESSIONS_PER_IP || 10),
  bandwidthBps: Number(process.env.WISP_BANDWIDTH_BPS || 10 * 1024 * 1024),
});

app.synth();
