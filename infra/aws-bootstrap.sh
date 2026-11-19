#!/usr/bin/env bash
# =============================================================================
# CrisisMap — AWS Bootstrap Script
# =============================================================================
# Run this in AWS CloudShell (console.aws.amazon.com → CloudShell icon).
# CloudShell already has the AWS CLI and your account credentials configured.
#
# BEFORE RUNNING:
#   1. Fill in every value in the CONFIG section below.
#   2. Run the script — it will create RDS and ElastiCache if they don't exist,
#      then wait for them to become available (allow 10-15 minutes total).
# =============================================================================
set -euo pipefail

# ─── CONFIG — edit before running ────────────────────────────────────────────

# Password you chose when creating the RDS instance
DB_PASSWORD="CHANGE_ME"

# New Better Auth secret for production (generate one with: openssl rand -base64 32)
BETTER_AUTH_SECRET="CHANGE_ME"

# Your Anthropic API key
ANTHROPIC_API_KEY="CHANGE_ME"

# Your deployed Vercel frontend URL (no trailing slash)
FRONTEND_URL="https://crisismap-undp.vercel.app"

# Secret for the one-time POST /api/v1/setup/seed endpoint (generate with: openssl rand -hex 32)
SEED_SECRET="CHANGE_ME"

# ─── FIXED NAMES (match what you created in the console) ─────────────────────
REGION="us-east-1"
APP="crisismap"
ENV="prod"
CLUSTER_NAME="${APP}-${ENV}"           # crisismap-prod
RDS_ID="${APP}-${ENV}-db"              # crisismap-prod-db
REDIS_ID="${APP}-${ENV}-redis"         # crisismap-prod-redis
ECR_REPO="crisismap-api"
BUCKET_NAME="${APP}-reports-prod"
EXECUTION_ROLE="crisismap-ecs-execution-role"
TASK_ROLE="crisismap-ecs-task-role"
TASK_FAMILY="${APP}-api"
CONTAINER_NAME="${APP}-api"
LOG_GROUP="/ecs/${APP}-api"

# ─── AUTO-DETECTED ───────────────────────────────────────────────────────────
echo "=== Detecting account and network..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text --region "$REGION")
mapfile -t SUBNET_ARRAY < <(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC_ID" \
  --query 'Subnets[*].SubnetId' --output text --region "$REGION" | tr '\t' '\n')

echo "Account : $ACCOUNT_ID"
echo "VPC     : $VPC_ID"
echo "Subnets : ${SUBNET_ARRAY[*]}"

# ─── SECURITY GROUPS ─────────────────────────────────────────────────────────
echo ""
echo "=== Creating security groups..."

ALB_SG=$(aws ec2 create-security-group \
  --group-name "${APP}-alb-sg" \
  --description "ALB public ingress for ${APP}" \
  --vpc-id "$VPC_ID" --region "$REGION" \
  --query GroupId --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters Name=group-name,Values="${APP}-alb-sg" Name=vpc-id,Values="$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")

aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG" --protocol tcp --port 80  --cidr 0.0.0.0/0 \
  --region "$REGION" 2>/dev/null || true
aws ec2 authorize-security-group-ingress \
  --group-id "$ALB_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0 \
  --region "$REGION" 2>/dev/null || true

ECS_SG=$(aws ec2 create-security-group \
  --group-name "${APP}-ecs-sg" \
  --description "ECS Fargate tasks for ${APP}" \
  --vpc-id "$VPC_ID" --region "$REGION" \
  --query GroupId --output text 2>/dev/null || \
  aws ec2 describe-security-groups \
    --filters Name=group-name,Values="${APP}-ecs-sg" Name=vpc-id,Values="$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text --region "$REGION")

aws ec2 authorize-security-group-ingress \
  --group-id "$ECS_SG" --protocol tcp --port 4000 \
  --source-group "$ALB_SG" --region "$REGION" 2>/dev/null || true

echo "ALB SG : $ALB_SG"
echo "ECS SG : $ECS_SG"

# ─── S3 BUCKET ───────────────────────────────────────────────────────────────
echo ""
echo "=== Creating S3 bucket..."
# us-east-1 must NOT use --create-bucket-configuration
aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null || true
aws s3api put-public-access-block --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  --region "$REGION"
echo "S3 bucket: $BUCKET_NAME"

# ─── RDS ─────────────────────────────────────────────────────────────────────
echo ""
echo "=== Creating RDS instance (if not already exists)..."
rds_create_output=$(aws rds create-db-instance \
  --db-instance-identifier "$RDS_ID" \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15 \
  --master-username crisismap \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 \
  --db-name crisismap \
  --no-publicly-accessible \
  --region "$REGION" 2>&1) || {
  if echo "$rds_create_output" | grep -q "DBInstanceAlreadyExists"; then
    echo "(RDS already exists — skipped)"
  else
    echo "ERROR: Failed to create RDS instance:" >&2
    echo "$rds_create_output" >&2
    exit 1
  fi
}

echo "=== Waiting for RDS to be available (may take 5-10 minutes)..."
aws rds wait db-instance-available \
  --db-instance-identifier "$RDS_ID" --region "$REGION"
DB_PASSWORD_ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASSWORD")

DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_ID" \
  --query 'DBInstances[0].Endpoint.Address' --output text --region "$REGION")
echo "RDS endpoint: $DB_ENDPOINT"

# Allow ECS tasks to reach RDS
RDS_SG=$(aws rds describe-db-instances \
  --db-instance-identifier "$RDS_ID" \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text --region "$REGION")
aws ec2 authorize-security-group-ingress \
  --group-id "$RDS_SG" --protocol tcp --port 5432 \
  --source-group "$ECS_SG" --region "$REGION" 2>/dev/null || true

# ─── ELASTICACHE ─────────────────────────────────────────────────────────────
echo ""
echo "=== Creating ElastiCache Redis (if not already exists)..."
redis_create_output=$(aws elasticache create-cache-cluster \
  --cache-cluster-id "$REDIS_ID" \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --region "$REGION" 2>&1) || {
  if echo "$redis_create_output" | grep -q "CacheClusterAlreadyExists"; then
    echo "(ElastiCache already exists — skipped)"
  else
    echo "ERROR: Failed to create ElastiCache cluster:" >&2
    echo "$redis_create_output" >&2
    exit 1
  fi
}

echo "=== Waiting for ElastiCache to be available..."
aws elasticache wait cache-cluster-available \
  --cache-cluster-id "$REDIS_ID" --region "$REGION"

REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "$REDIS_ID" --show-cache-node-info \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text --region "$REGION")
echo "Redis endpoint: $REDIS_ENDPOINT"

# Allow ECS tasks to reach Redis
REDIS_SG=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id "$REDIS_ID" \
  --query 'CacheClusters[0].SecurityGroups[0].SecurityGroupId' \
  --output text --region "$REGION" 2>/dev/null || echo "")
if [ -n "$REDIS_SG" ] && [ "$REDIS_SG" != "None" ]; then
  aws ec2 authorize-security-group-ingress \
    --group-id "$REDIS_SG" --protocol tcp --port 6379 \
    --source-group "$ECS_SG" --region "$REGION" 2>/dev/null || true
fi

# ─── CLOUDWATCH LOG GROUP ────────────────────────────────────────────────────
echo ""
echo "=== Ensuring CloudWatch log group exists..."
aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null || true
aws logs put-retention-policy \
  --log-group-name "$LOG_GROUP" \
  --retention-in-days 30 --region "$REGION" 2>/dev/null || true

# ─── ALB + TARGET GROUP + LISTENER ───────────────────────────────────────────
echo ""
echo "=== Creating ALB..."
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "${APP}-api-alb" \
  --subnets ${SUBNET_ARRAY[@]} \
  --security-groups "$ALB_SG" \
  --region "$REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || \
  aws elbv2 describe-load-balancers --names "${APP}-api-alb" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text --region "$REGION")

TG_ARN=$(aws elbv2 create-target-group \
  --name "${APP}-api-tg" \
  --protocol HTTP --port 4000 \
  --vpc-id "$VPC_ID" --target-type ip \
  --health-check-path /api/v1/health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --region "$REGION" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || \
  aws elbv2 describe-target-groups --names "${APP}-api-tg" \
    --query 'TargetGroups[0].TargetGroupArn' --output text --region "$REGION")

aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP --port 80 \
  --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
  --region "$REGION" > /dev/null 2>/dev/null || true

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text --region "$REGION")
echo "ALB DNS: $ALB_DNS"

# ─── ECS TASK DEFINITION ─────────────────────────────────────────────────────
echo ""
echo "=== Registering ECS task definition..."
TASK_DEF_FILE=$(mktemp /tmp/crisismap-task-def.XXXXXX.json)
trap 'rm -f "$TASK_DEF_FILE"' EXIT

cat > "$TASK_DEF_FILE" << TASKDEF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/${EXECUTION_ROLE}",
  "taskRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/${TASK_ROLE}",
  "containerDefinitions": [
    {
      "name": "${CONTAINER_NAME}",
      "image": "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest",
      "portMappings": [{"containerPort": 4000, "protocol": "tcp"}],
      "essential": true,
      "environment": [
        {"name": "NODE_ENV",                              "value": "production"},
        {"name": "API_PORT",                              "value": "4000"},
        {"name": "TRUST_PROXY",                           "value": "1"},
        {"name": "CORS_ORIGINS",                          "value": "${FRONTEND_URL}"},
        {"name": "BETTER_AUTH_URL",                       "value": "${FRONTEND_URL}"},
        {"name": "BETTER_AUTH_SECRET",                    "value": "${BETTER_AUTH_SECRET}"},
        {"name": "DATABASE_URL",                          "value": "postgresql://crisismap:${DB_PASSWORD_ENCODED}@${DB_ENDPOINT}:5432/crisismap?sslmode=require"},
        {"name": "REDIS_URL",                             "value": "redis://${REDIS_ENDPOINT}:6379"},
        {"name": "REDIS_HOST",                            "value": "${REDIS_ENDPOINT}"},
        {"name": "REDIS_PORT",                            "value": "6379"},
        {"name": "STORAGE_REGION",                        "value": "${REGION}"},
        {"name": "STORAGE_BUCKET",                        "value": "${BUCKET_NAME}"},
        {"name": "STORAGE_ENDPOINT",                      "value": "https://s3.${REGION}.amazonaws.com"},
        {"name": "STORAGE_PUBLIC_URL",                    "value": "https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com"},
        {"name": "AI_CLASSIFICATION_ADAPTER",             "value": "runtime"},
        {"name": "ANTHROPIC_MODEL",                       "value": "claude-sonnet-4-6"},
        {"name": "ANTHROPIC_API_BASE_URL",                "value": "https://api.anthropic.com"},
        {"name": "ANTHROPIC_API_KEY",                     "value": "${ANTHROPIC_API_KEY}"},
        {"name": "TRANSLATION_ADAPTER",                   "value": "mock"},
        {"name": "RATE_LIMIT_PER_HOUR",                   "value": "10"},
        {"name": "RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE",    "value": "30"},
        {"name": "RATE_LIMIT_ADMIN_CRISIS_WRITE_PER_MINUTE", "value": "30"},
        {"name": "SEED_SECRET",                              "value": "${SEED_SECRET}"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "${LOG_GROUP}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
TASKDEF

aws ecs register-task-definition \
  --cli-input-json "file://${TASK_DEF_FILE}" \
  --region "$REGION" > /dev/null
echo "Task definition registered: ${TASK_FAMILY}"

# ─── ECS SERVICE ─────────────────────────────────────────────────────────────
echo ""
echo "=== Creating ECS service..."
SUBNET_CSV=$(IFS=,; echo "${SUBNET_ARRAY[*]}")

aws ecs create-service \
  --cluster "$CLUSTER_NAME" \
  --service-name "${APP}-api" \
  --task-definition "$TASK_FAMILY" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_CSV}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=${TG_ARN},containerName=${CONTAINER_NAME},containerPort=4000" \
  --region "$REGION" > /dev/null 2>/dev/null || echo "(service may already exist — skipped)"

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Bootstrap complete! Copy these into GitHub → Environments"
echo "  → production → Variables"
echo "════════════════════════════════════════════════════════════"
echo "  AWS_REGION                   = ${REGION}"
echo "  ECR_REPOSITORY               = ${ECR_REPO}"
echo "  ECS_CLUSTER_NAME             = ${CLUSTER_NAME}"
echo "  ECS_SERVICE_NAME             = ${APP}-api"
echo "  ECS_TASK_DEFINITION_FAMILY   = ${TASK_FAMILY}"
echo "  ECS_CONTAINER_NAME           = ${CONTAINER_NAME}"
echo "  API_HEALTHCHECK_URL          = http://${ALB_DNS}/api/v1/health"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Next: set the 7 vars above in GitHub, then merge any"
echo "  apps/api change to main to trigger the first deploy."
echo "════════════════════════════════════════════════════════════"
