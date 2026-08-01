---
status: approved
owner: infrastructure
last_reviewed: 2026-07-26
scope: aws-deployment-design
---

# Blocks — AWS Deployment Architecture

```mermaid
graph TB
    subgraph Client["🌐 Client"]
        DNS[Route 53]
        WAF[AWS WAF]
        CF[CloudFront CDN]
        Browser[Browser SPA]
    end

    subgraph Frontend["Frontend Layer"]
        S3[S3 Bucket<br/>React SPA (Vite)]
    end

    subgraph CD["Container Registry"]
        ECR[Amazon ECR<br/>.NET + Python images]
    end

    subgraph Compute["Compute — ECS Fargate"]
        ALB[ALB<br/>HTTP/2 + gRPC]
        
        subgraph Services["Service Cluster"]
            GW[API Gateway<br/>YARP Reverse Proxy<br/>.NET 10]
            SS[System Service<br/>.NET 10<br/>Auth / RBAC / Audit]
            FS[File Service<br/>.NET 10<br/>Upload / gRPC]
            AS[Assistant Service<br/>FastAPI<br/>AI Chat / SSE]
            TS[TradeLab Service<br/>FastAPI<br/>Backtesting / Trading]
        end
        
        subgraph Runners["Async Workers"]
            TR[TradeLab Runner<br/>Python SDK<br/>Strategy Execution]
        end
    end

    subgraph Data["Data Layer"]
        RDS1[RDS PostgreSQL<br/>System: users, roles,<br/>menus, permissions]
        RDS2[RDS PostgreSQL<br/>TradeLab: strategies,<br/>backtests, datasets]
        S3Files[S3 Bucket<br/>File uploads / attachments]
    end

    subgraph AI["AI / ML"]
        BE[Amazon Bedrock<br/>or SageMaker<br/>LLM inference]
    end

    subgraph Monitor["Observability"]
        CW[CloudWatch<br/>Logs / Metrics / Alarms]
        XR[X-Ray<br/>Tracing]
    end

    subgraph Net["Networking"]
        VPC[VPC<br/>Private + Public subnets]
        SG[Security Groups]
        NLB[Network LB<br/>gRPC services]
    end

    subgraph CICD["CI/CD"]
        GA[GitHub Actions]
        PIPE[CodePipeline]
    end

    %% Client flow
    Browser --> CF
    DNS --> CF
    CF --> S3
    CF --> ALB
    CF --> WAF

    %% Frontend to compute
    S3 --> Browser
    ALB --> GW

    %% Gateway routes
    GW --> SS
    GW --> FS
    GW --> AS
    GW --> TS

    %% Inter-service
    SS -. gRPC .-> FS

    %% Data connections
    SS --> RDS1
    TS --> RDS2
    FS --> S3Files

    %% AI
    AS --> BE

    %% Runners
    TS --> TR

    %% Ops
    SS --> CW
    FS --> CW
    AS --> CW
    TS --> CW
    SS --> XR
    FS --> XR
    TS --> XR

    %% CI/CD
    GA --> ECR
    ECR --> Services
    ECR --> Runners

    classDef aws fill:#FF9900,color:#232F3E,font-weight:bold
    classDef app fill:#1E90FF,color:white
    classDef data fill:#2E8B57,color:white
    classDef net fill:#6B5B95,color:white

    class DNS,WAF,CF,S3,ECR,ALB,RDS1,RDS2,S3Files,BE,CW,XR,VPC,SG,NLB,GA,PIPE aws
    class Browser,GW,SS,FS,AS,TS,TR app
    class RDS1,RDS2,S3Files data
    class VPC,SG,NLB net
```

## Component → AWS Service Mapping

| Project Component | Technology | AWS Service | Why |
|---|---|---|---|
| **Web SPA** | React / Vite / TS | **S3 + CloudFront** | Static hosting, edge cache, low cost. CloudFront for HTTPS + custom domain |
| **API Gateway** | .NET 10 (YARP) | **ECS Fargate** behind **ALB** | Stateless reverse proxy, scales to zero when idle. ALB terminates TLS, routes path-based |
| **System Service** | .NET 10 (EF Core) | **ECS Fargate** + **RDS PostgreSQL** | Stateful service needs relational DB. RDS Multi-AZ for HA. Connection pooling via RDS Proxy |
| **File Service** | .NET 10 | **ECS Fargate** + **S3** | Uploads stored in S3. Service handles presigned URLs. 50MB limit fits S3 multipart |
| **Assistant Service** | FastAPI / Python | **ECS Fargate** + **Bedrock** | FastAPI on Fargate. Bedrock replaces local Ollama for LLM inference |
| **TradeLab Service** | FastAPI / Python | **ECS Fargate** + **RDS PostgreSQL** | Trading backtest API. Separate RDS instance for isolation |
| **TradeLab Runner** | Python SDK | **Fargate Task / Batch** | Async strategy execution. Batch for long-running backtests |
| **Auth** | JWT (custom) | **Cognito User Pool** (optional) | Replace custom JWT with Cognito, or keep existing + Secrets Manager for signing keys |
| **gRPC** | gRPC-Web | **NLB** (if cross-service) or **ALB HTTP/2** | Services talk gRPC internally. ALB supports gRPC via HTTP/2 |
| **Secrets** | .env / secrets | **Secrets Manager** / **Parameter Store** | DB creds, API keys, Binance credentials |
| **CI/CD** | GitHub Actions | **ECR** → **ECS** via CodePipeline or GA deploy | Build images on push → ECR → Fargate rolling update |
| **Monitoring** | OpenTelemetry | **CloudWatch** + **X-Ray** | Already in service-defaults (OTel). Ship logs + traces |

## Network Layout

- **VPC**: 2 AZs, public + private subnets
- **Public**: ALB, NAT Gateway (for private egress)
- **Private**: ECS Fargate tasks, RDS, S3 (via VPC Endpoint)
- **Security Groups**: ALB → ECS → RDS. Least-privilege per service

## Estimated Monthly Cost (low traffic dev)

| Service | Config | Est. Cost |
|---|---|---|
| ECS Fargate | 2× .5 vCPU, 1GB RAM (burst) | ~$15 |
| RDS PostgreSQL | 1× db.t4g.micro | ~$15 |
| S3 + CloudFront | 10GB storage, 50GB transfer | ~$3 |
| ALB | 1 LCU avg | ~$20 |
| ECR | Small images | Free |
| **Total** | **Dev / staging** | **~$55/mo** |
| **Production** | Scale up Fargate + RDS | ~$150-300/mo |
