# Current State

## B0.4: Prisma foundation, database connectivity, and migration workflow

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

The direct PostgreSQL and Redis clients from B0.3 remain dedicated operational readiness probes.

B0.4 adds application persistence infrastructure without adding application data:

- Prisma ORM 7 and its explicit `prisma-client` generator
- a PostgreSQL datasource schema with no application models
- root `prisma.config.ts` for schema, migrations, and CLI datasource configuration
- an ignored, reproducible generated Prisma Client workflow
- `@prisma/adapter-pg` for Prisma PostgreSQL runtime connectivity
- the shared `@tteeka/database` workspace package
- one authoritative Prisma Client factory that accepts validated configuration
- process-scoped Prisma Client ownership and cleanup in the API
- shared Prisma construction and cleanup support in the worker
- a non-business `SELECT 1` database connectivity command
- Prisma format, validation, generation, migration-status, development-migration, and deployment-migration scripts
- unit coverage for the database factory and API/worker lifecycle integration
- real local PostgreSQL connectivity validation through Prisma

The API does not eagerly connect Prisma during bootstrap. A PostgreSQL outage therefore does not kill the process: liveness remains independent, while the existing direct `pg` readiness probe reports the outage. The worker constructs the same shared infrastructure but performs no database query, queue work, or business processing.

## Explicitly not implemented

- frontend applications or UI
- application data models
- migrations containing Tteeka domain tables
- business persistence repositories
- authentication or authorization
- users, merchants, staff, roles, permissions, or sessions
- customers or catalogue
- products or inventory
- orders or payments
- cash on delivery (COD)
- delivery, riders, or returns
- receipts
- outbox functionality
- BullMQ, queues, workers, or background jobs
- WhatsApp, MTN, or Airtel integrations
- Swagger or OpenAPI
- business functionality of any kind

No Tteeka business data models or domain migrations exist. Prisma is exposed only through infrastructure services; there are no business repositories, queries, services, or endpoints.

These items belong to later steps and are outside B0.4.
