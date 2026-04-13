#!/usr/bin/env bash
#
# Build the Docker image and push it to ECR.
#
# Requires:
#   - AWS CLI configured (aws configure)
#   - Docker running
#   - The WispServerStack deployed at least once (so the ECR repo exists)
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

echo "[1/4] Logging into ECR (${REGION})..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"

echo "[2/4] Building image..."
cd "$(dirname "$0")"
docker build -t "${REPO_NAME}:${TAG}" .

echo "[3/4] Tagging image as ${REPO_URI}:${TAG}..."
docker tag "${REPO_NAME}:${TAG}" "${REPO_URI}:${TAG}"

echo "[4/4] Pushing image..."
docker push "${REPO_URI}:${TAG}"

echo ""
echo "done — pushed ${REPO_URI}:${TAG}"
echo ""
echo "To roll out the new image to App Runner:"
echo "  aws apprunner start-deployment --service-arn \$(aws apprunner list-services --query \"ServiceSummaryList[?ServiceName=='wisp-server'].ServiceArn | [0]\" --output text)"
