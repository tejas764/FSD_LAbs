# API Deployment — Docker and GitHub Actions

This document describes the containerization and continuous deployment pipeline for the CrisisMap API in apps/api.

## Verification status

This document has been verified against the current deployment implementation:

- `.github/workflows/deploy-api.yml`
- `apps/api/Dockerfile`
- `apps/api/.env.production.example`

## Architecture

Split deployment model:
- Frontend (apps/web): Vercel
- Backend API (apps/api): Amazon ECS Express Mode (ECS service on Fargate)
- CI/CD: GitHub Actions workflow triggered by pushes to main with path filters

## Dockerfile

Location: apps/api/Dockerfile

Multi-stage build process:

1. Builder stage (node:24.14.1-alpine)
- Install build tools for native addons.
- Install dependencies with npm ci.
- Generate Prisma client.
- Compile TypeScript.

2. Runner stage (node:24.14.1-alpine)
- Create a non-root app user.
- Install production dependencies only.
- Copy compiled dist and Prisma runtime artifacts.
- Startup command runs migrations, then starts the API:
  npx prisma migrate deploy && node dist/main.js

Container runtime:
- Port: 4000
- User: appuser (non-root)

## Deployment Workflow

File: .github/workflows/deploy-api.yml

Triggers (main branch only):
- apps/api/**
- infra/**
- docs/openapi.yaml

Does not trigger for apps/web-only changes.

### Job 1: Test and Contract Gates

Runs on ubuntu-latest with Postgres service.

Checks:
1. npm ci
2. Prisma generate
3. Prisma migrate deploy (CI DB)
4. Type-check
5. Lint
6. Unit tests
7. E2E tests
8. OpenAPI export
9. Contract drift gate: git diff --exit-code docs/openapi.yaml

Deployment continues only if all gates pass.

### Job 2: Build and Deploy to ECS

Flow:
1. Configure AWS credentials.
2. Log in to ECR.
3. Build and push image (sha tag and latest tag).
4. Download current ECS task definition by family.
5. Remove read-only task definition fields.
6. Render task definition with new image URI.
7. Deploy rendered task definition to ECS service.
8. Wait for service stability.
9. Smoke test API_HEALTHCHECK_URL.

## Required GitHub Actions Configuration

### Secrets (Settings → Secrets and variables → Actions → Secrets)

Sensitive credentials only. Values are masked in logs.

| Secret | Purpose |
|---|---|
| AWS_ACCESS_KEY_ID | IAM access key ID for the CI/CD deploy user |
| AWS_SECRET_ACCESS_KEY | IAM secret access key for the CI/CD deploy user |

### Variables (Settings → Secrets and variables → Actions → Variables)

Non-sensitive configuration. Visible in workflow logs and UI.

| Variable | Example value | Purpose |
|---|---|---|
| AWS_REGION | us-east-1 | AWS region |
| ECR_REPOSITORY | crisismap-api | ECR repository name |
| ECS_CLUSTER_NAME | crisismap-prod | ECS cluster name |
| ECS_SERVICE_NAME | crisismap-api-svc | ECS service name |
| ECS_CONTAINER_NAME | api | Container name inside the task definition |
| ECS_TASK_DEFINITION_FAMILY | crisismap-api | Task definition family |
| API_HEALTHCHECK_URL | https://api.example.org/api/v1/health | Smoke-test URL after deploy |

## IAM Permissions for CI Deploy User

Minimum example policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": [
        "arn:aws:iam::*:role/*ecsTaskExecutionRole*",
        "arn:aws:iam::*:role/*ecsTaskRole*"
      ]
    }
  ]
}
```

Scope Resource values to your account resources for production hardening.

## Runtime Environment Variables

Runtime environment is configured in ECS task definition and/or AWS Secrets Manager.

Base values are documented in apps/api/.env.production.example.

## Initial Data Seeding

The database is empty after a fresh deployment. Use the protected seed endpoint to populate
test users, crises, and reports. The endpoint is idempotent (safe to call multiple times).

### Prerequisites

Add `SEED_SECRET` to the ECS task definition environment variables. Generate a value with:

```bash
openssl rand -hex 32
```

### Usage

```bash
curl -X POST https://<api-host>/api/v1/setup/seed \
  -H "Authorization: Bearer <SEED_SECRET>"
# → {"ok":true,"message":"Database seeded successfully"}
```

This creates:
- **3 dashboard users** — `admin@crisismap.local`, `analyst@crisismap.local`, `viewer@crisismap.local` (password: `Password123!`)
- **6 crises** — Antakya earthquake, Kabul flood, Aceh floods, Manila typhoon, California wildfire, one inactive
- **87 sample reports** spread across all crises with mixed moderation statuses

Returns 403 if `SEED_SECRET` is not set in the environment or the header does not match.

## Deployment Flow

1. Push or merge to main with apps/api or infra changes.
2. Workflow runs test and contract gates.
3. If gates pass, image is built and pushed to ECR.
4. ECS service is updated to a new task revision with the new image.
5. ECS performs rolling replacement and reports stable.
6. Smoke test verifies GET /api/v1/health.

## Rollback

Rollback to previous ECS task revision:

1. In ECS service, select previous task definition revision.
2. Update service to that revision.

Or via CLI, update service with a known-good task definition revision.

## Local Validation

Before merge, validate container locally:

```bash
cd apps/api
docker build -t crisismap-api:test .
docker run \
  --env DATABASE_URL=postgresql://crisismap:crisismap@host.docker.internal:5432/crisismap \
  --env REDIS_URL=redis://host.docker.internal:6379 \
  --env BETTER_AUTH_SECRET=test-secret-32-chars-minimum \
  --env NODE_ENV=test \
  -p 4000:4000 \
  crisismap-api:test
curl http://localhost:4000/api/v1/health
```

## Troubleshooting

OpenAPI drift gate fails:
- Run npm run openapi:export from apps/api.
- Commit updated docs/openapi.yaml.

ECS deploy step fails:
- Confirm ECS_TASK_DEFINITION_FAMILY exists and is active.
- Confirm ECS_CONTAINER_NAME matches containerDefinitions[].name.
- Confirm iam:PassRole is allowed for task roles used by the task definition.

Smoke test fails:
- Confirm API_HEALTHCHECK_URL points to /api/v1/health.
- Confirm ECS service reached stable state and has healthy tasks.
