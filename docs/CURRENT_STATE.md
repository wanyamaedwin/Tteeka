# Current State

## B0.3: Application configuration and infrastructure health integration

The repository contains a backend-only npm workspace monorepo targeting Node.js 24 LTS.

The B0.1 engineering foundation provides:

- npm workspaces for `apps/*` and `packages/*`
- shared strict TypeScript configuration
- ESLint and Prettier configuration
- repository-wide format, lint, typecheck, test, and build commands
- development commands for the API and worker
- a minimal NestJS 11 API bootstrap with an empty root module
- a minimal standalone TypeScript worker entry point
- placeholder shared `config` and `testing` packages
- repository documentation and architecture decision records

B0.2 adds local development infrastructure:

- a PostgreSQL 18 Alpine container
- a Redis 8 Alpine container with append-only persistence enabled
- persistent named volumes for PostgreSQL and Redis data
- readiness health checks using `pg_isready` and `redis-cli ping`
- documented local environment configuration in `.env.example`
- root commands to start, inspect, and stop the infrastructure

B0.3 adds application configuration and operational health integration:

- a shared Zod-validated, strongly typed configuration package
- validated `NODE_ENV`, `API_PORT`, `DATABASE_URL`, `REDIS_URL`, and `INFRA_HEALTH_TIMEOUT_MS` values
- fail-fast configuration startup for the API and worker
- typed global configuration injection in the NestJS API
- `GET /api/v1/health/live` for process-only liveness
- `GET /api/v1/health/ready` for infrastructure-aware readiness
- a PostgreSQL readiness probe that executes `SELECT 1`
- a Redis readiness probe that requires `PING` to return `PONG`
- deterministic readiness timeouts and secret-safe failure responses
- automated configuration, health, and worker configuration tests

The PostgreSQL and Redis clients are used only for operational readiness checks. They do not provide application persistence, caching, sessions, queue processing, or business behavior.

## Explicitly not implemented

- frontend applications or UI
- Prisma or `@prisma/client`
- database schemas or migrations
- business persistence or repositories
- authentication or authorization
- users, merchants, roles, or permissions
- customers or catalogue
- products or inventory
- orders or payments
- cash on delivery (COD)
- delivery, riders, or returns
- receipts
- BullMQ, queues, workers, or background jobs
- WhatsApp, MTN, or Airtel integrations
- Swagger or OpenAPI
- business functionality of any kind

No Tteeka business data models exist. The worker validates PostgreSQL and Redis URLs but does not open connections to either service. The API connections are health-only and are not exposed to domain code.

These items belong to later steps and are outside B0.3.
