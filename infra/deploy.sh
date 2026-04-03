#!/usr/bin/env bash
# Deploy v9 AWS infrastructure stacks.
#
# Usage:
#   ./infra/deploy.sh cache       # S3 + CloudFront artifact cache
#   ./infra/deploy.sh ecr         # ECR Docker image repository
#   ./infra/deploy.sh codebuild   # CodeBuild nightly soak project
#   ./infra/deploy.sh runner      # Self-hosted GitHub Actions runner (interactive — needs token)
#   ./infra/deploy.sh all         # Deploy cache + ecr + codebuild (not runner)
#
# Prerequisites:
#   - AWS CLI configured with admin credentials
#   - Region set (defaults to us-east-1)

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
PROJECT="${PROJECT_NAME:-v9-edgejs}"
DIR="$(cd "$(dirname "$0")" && pwd)"

deploy_stack() {
  local stack_name="$1"
  local template="$2"
  shift 2
  echo ">>> Deploying stack: ${stack_name}"
  aws cloudformation deploy \
    --stack-name "$stack_name" \
    --template-file "$template" \
    --capabilities CAPABILITY_NAMED_IAM \
    --region "$REGION" \
    --parameter-overrides "ProjectName=${PROJECT}" "$@" \
    --no-fail-on-empty-changeset
  echo ">>> Stack ${stack_name} deployed."
  aws cloudformation describe-stacks \
    --stack-name "$stack_name" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output table 2>/dev/null || true
}

case "${1:-help}" in
  cache)
    deploy_stack "${PROJECT}-artifact-cache" "${DIR}/artifact-cache.cfn.yml"
    echo ""
    echo "Next steps:"
    echo "  1. Copy the CIUploadRoleArn output → GitHub repo variable WASM_CI_ROLE_ARN"
    echo "  2. Copy the ArtifactBucketName output → GitHub repo variable WASM_ARTIFACT_BUCKET"
    echo "  3. Copy the CDNDomainName output → set as WASM_ASSETS_CDN_URL for engineers"
    ;;
  ecr)
    deploy_stack "${PROJECT}-ecr" "${DIR}/ecr.cfn.yml"
    echo ""
    echo "Next steps:"
    echo "  1. Copy the RepositoryUri output → GitHub repo variable ECR_REPO_NAME"
    echo "  2. Run: docker build -f docker/Dockerfile -t <uri>:latest . && docker push <uri>:latest"
    ;;
  codebuild)
    deploy_stack "${PROJECT}-codebuild-soak" "${DIR}/codebuild-soak.cfn.yml"
    echo ""
    echo "Manual trigger: aws codebuild start-build --project-name ${PROJECT}-soak"
    ;;
  runner)
    echo ">>> Self-hosted runner requires a GitHub registration token."
    echo "    Get one from: https://github.com/maceip/v9/settings/actions/runners/new"
    read -rp "GitHub runner token: " RUNNER_TOKEN
    read -rp "VPC ID: " VPC_ID
    read -rp "Subnet ID (public): " SUBNET_ID
    read -rp "SSH key pair name (blank to skip): " KEY_PAIR
    deploy_stack "${PROJECT}-runner" "${DIR}/runner.cfn.yml" \
      "GitHubRunnerToken=${RUNNER_TOKEN}" \
      "VpcId=${VPC_ID}" \
      "SubnetId=${SUBNET_ID}" \
      "KeyPairName=${KEY_PAIR:-}"
    ;;
  all)
    "$0" cache
    "$0" ecr
    "$0" codebuild
    echo ""
    echo ">>> All non-interactive stacks deployed."
    echo "    Run '$0 runner' separately to set up the self-hosted runner."
    ;;
  help|*)
    echo "Usage: $0 <cache|ecr|codebuild|runner|all>"
    echo ""
    echo "Stacks:"
    echo "  cache      S3 + CloudFront artifact cache (engineers skip make build)"
    echo "  ecr        ECR Docker image repository"
    echo "  codebuild  CodeBuild nightly soak (72 vCPU, EventBridge schedule)"
    echo "  runner     Self-hosted Graviton Spot runner (interactive)"
    echo "  all        Deploy cache + ecr + codebuild"
    ;;
esac
