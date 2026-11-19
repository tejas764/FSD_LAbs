# CrisisMap API — AWS Cost Estimation

**Region:** us-east-1 (N. Virginia)  
**Environment:** Production (single-task, minimum viable)  
**Pricing basis:** AWS public list prices as of May 2026 (USD, no reserved instances)

---

## Infrastructure Provisioned

| Resource | Spec |
|---|---|
| ECS Fargate | 1 task · 0.5 vCPU · 1 GB RAM · 24/7 |
| RDS PostgreSQL 15 | db.t3.micro · 20 GB gp2 · single-AZ |
| ElastiCache Redis | cache.t3.micro · single node |
| Application Load Balancer | 1 ALB · HTTP:80 |
| S3 | 1 bucket (report photos) |
| ECR | 1 repository |
| CloudWatch Logs | 30-day retention |

---

## Monthly Cost Breakdown

### Compute — ECS Fargate

| Component | Rate | Usage | Cost |
|---|---|---|---|
| vCPU | $0.04048 / vCPU-hour | 0.5 vCPU × 730 h | $14.78 |
| Memory | $0.004445 / GB-hour | 1 GB × 730 h | $3.24 |
| **Subtotal** | | | **$18.02** |

### Database — RDS PostgreSQL db.t3.micro

| Component | Rate | Usage | Cost |
|---|---|---|---|
| Instance | $0.017 / hour | 730 h | $12.41 |
| Storage (gp2) | $0.115 / GB-month | 20 GB | $2.30 |
| Backup storage | Free | Up to DB size | $0.00 |
| **Subtotal** | | | **$14.71** |

### Cache — ElastiCache Redis cache.t3.micro

| Component | Rate | Usage | Cost |
|---|---|---|---|
| Node | $0.017 / hour | 730 h | $12.41 |
| **Subtotal** | | | **$12.41** |

### Networking — Application Load Balancer

| Component | Rate | Usage | Cost |
|---|---|---|---|
| ALB-hours | $0.0225 / hour | 730 h | $16.43 |
| LCU charges | ~$0.008 / LCU-hour | Low traffic ≈ 1 LCU | $5.84 |
| **Subtotal** | | | **$22.27** |

### Storage — S3

| Component | Rate | Usage | Cost |
|---|---|---|---|
| Storage | $0.023 / GB-month | ~10 GB (photos) | $0.23 |
| PUT requests | $0.005 / 1000 | ~10 k/month | $0.05 |
| GET requests | $0.0004 / 1000 | ~50 k/month | $0.02 |
| **Subtotal** | | | **$0.30** |

### Container Registry — ECR

| Component | Rate | Usage | Cost |
|---|---|---|---|
| Storage | $0.10 / GB-month | ~0.5 GB image | $0.05 |
| Data transfer (in-region) | Free | ECS pulls | $0.00 |
| **Subtotal** | | | **$0.05** |

### Observability — CloudWatch

| Component | Rate | Usage | Cost |
|---|---|---|---|
| Log ingestion | $0.50 / GB | ~2 GB/month | $1.00 |
| Log storage | $0.03 / GB-month | ~2 GB × 30 days | $0.06 |
| **Subtotal** | | | **$1.06** |

### Data Transfer — Outbound Internet

| Component | Rate | Usage | Cost |
|---|---|---|---|
| First 100 GB/month | $0.09 / GB | ~5 GB | $0.45 |
| **Subtotal** | | | **$0.45** |

---

## Monthly Total

| Service | Cost |
|---|---|
| ECS Fargate | $18.02 |
| RDS PostgreSQL | $14.71 |
| ElastiCache Redis | $12.41 |
| Application Load Balancer | $22.27 |
| S3 | $0.30 |
| ECR | $0.05 |
| CloudWatch | $1.06 |
| Data Transfer | $0.45 |
| **Total** | **$69.27 / month** |

**Annual estimate:** ~$831 / year

---

## Cost Reduction Options

### Short-term (no architecture change)

| Option | Saving | Trade-off |
|---|---|---|
| Stop ECS service when not in use (dev/demo only) | ~$18/month | Manual restart required |
| RDS free tier (new AWS account, first 12 months) | ~$14/month | Only for new accounts |
| Reserved Instances — RDS 1-year no-upfront | ~40% on RDS (~$5/month) | 1-year commitment |

### Medium-term (architecture changes)

| Option | Saving | Trade-off |
|---|---|---|
| Replace ElastiCache with Upstash Redis (serverless) | ~$10/month at low usage | Latency slightly higher |
| Replace RDS with Aurora Serverless v2 | Variable; cheaper at low usage | Min ACU cost applies |
| Use AWS Graviton (ARM) Fargate tasks | ~20% on compute | Requires ARM Docker build |

### Scaling cost (when traffic grows)

At 10× API traffic (high-volume crisis response):

| Resource | Change | Added cost |
|---|---|---|
| Fargate tasks | 1 → 3 tasks | +$36/month |
| RDS | db.t3.micro → db.t3.small | +$12/month |
| ALB LCU | 1 → 5 LCU | +$23/month |
| S3 / Data transfer | 10 GB → 100 GB | +$8/month |
| **Estimated total at 10×** | | **~$148/month** |

---

## Cost Monitoring Recommendations

1. Set AWS Budget alert at $80/month (send email when 80% threshold reached).
2. Enable Cost Anomaly Detection for the `crisismap` tag group.
3. Tag all resources with `Project=crisismap` and `Env=prod` for per-resource visibility.
4. Review monthly in AWS Cost Explorer → filter by service.

---

## Notes

- Prices exclude VAT/tax, which varies by country.
- Estimates assume 24/7 operation at low traffic (UNDP pilot phase).
- LibreTranslate is set to `mock` adapter in production by default; enabling a live LibreTranslate instance on a separate EC2 would add ~$8-15/month (t3.small).
- Costs do not include domain name registration or TLS certificate (AWS ACM certificates are free when used with ALB).
