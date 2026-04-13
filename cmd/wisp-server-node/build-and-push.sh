#!/usr/bin/env bash
#
# Build the Docker image and push it to ECR.
#
# Creates the ECR repository on the first run so the initial `cdk deploy`
# has an image to point App Runner at. App Runner refuses to stabilize
# against an empty repo — it retries for ~4 minutes and then fails the
# whole stack with HandlerErrorCode: NotStabilized. That's why this
# script MUST run before `cdk deploy`.
#
# Requires:
#   - AWS CLI configured (aws configure)
#   - Docker running
#
# Usage:
#   ./build-and-push.sh [tag]
#
# Defaults the image tag to "latest".

set -euo pipefail

TAG="${1:-latest}"
REGION="${AWS_REGION:-us-east-1}"
REPO_NAME="wisp-server-node"

# Look up the account ID
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO_URI="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"

echo "[1/5] Ensuring ECR repo ${REPO_NAME} exists..."
# describe-repositories returns a non-zero exit and RepositoryNotFoundException
# when the repo is absent — that's our signal to create it. Everything else
# (auth failures, network errors) propagates up via set -e on create-repository.
if ! aws ecr describe-repositories \
    --region "${REGION}" \
    --repository-names "${REPO_NAME}" \
    >/dev/null 2>&1; then
  echo "      not found — creating it"
  aws ecr create-repository \
    --region "${REGION}" \
    --repository-name "${REPO_NAME}" \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability MUTABLE \
    >/dev/null
  # Match the lifecycle policy the CDK stack used to set (keep last 10 images)
  # so image churn doesn't grow the repo unboundedly.
  aws ecr put-lifecycle-policy \
    --region "${REGION}" \
    --repository-name "${REPO_NAME}" \
    --lifecycle-policy-text '{"rules":[{"rulePriority":1,"description":"Keep last 10 images","selection":{"tagStatus":"any","countType":"imageCountMoreThanOrEqual","countNumber":10},"action":{"type":"expire"}}]}' \
    >/dev/null
  echo "      created ${REPO_URI}"
else
  echo "      exists"
fi

echo "[2/5] Logging into ECR (${REGION})..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

echo "[3/5] Building image..."
cd "$(dirname "$0")"
docker build -t "${REPO_NAME}:${TAG}" .

echo "[4/5] Tagging image as ${REPO_URI}:${TAG}..."
docker tag "${REPO_NAME}:${TAG}" "${REPO_URI}:${TAG}"

echo "[5/5] Pushing image..."
docker push "${REPO_URI}:${TAG}"

echo ""
echo "done — pushed ${REPO_URI}:${TAG}"
echo ""
echo "Next steps:"
echo "  First deploy (stack does not exist yet):"
echo "    cd infra && npx cdk deploy"
echo ""
echo "  Subsequent image updates (stack already deployed):"
echo "    aws apprunner start-deployment --service-arn \$(aws apprunner list-services --query \"ServiceSummaryList[?ServiceName=='wisp-server'].ServiceArn | [0]\" --output text)"
