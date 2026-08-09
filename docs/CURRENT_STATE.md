# Current State

## B1.1: Merchant, User, and Membership data model foundation

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

B1.1 adds Tteeka's first domain data foundation:

- the `Merchant` tenant model with contact fields, Uganda-first currency and timezone defaults, and lifecycle status
- the global `User` human identity model with required unique canonical phone storage and optional unique email storage
- the `MerchantMembership` model for the many-to-many association between merchants and users
- `MerchantStatus`, `UserStatus`, and `MerchantMembershipStatus` lifecycle enums
- native PostgreSQL UUID primary keys with database-generated UUIDv7 defaults
- `timestamptz(3)` creation and update timestamps
- a database-enforced unique `(merchant_id, user_id)` membership pair
- explicitly named status and membership lookup indexes
- restrictive foreign keys that prevent hard deletion of referenced merchants and users
- the first genuine, reviewed Prisma migration: `20260809201741_identity_foundation`
- real PostgreSQL integration coverage for defaults, UUID versions, uniqueness, relationships, foreign keys, deletion restrictions, lifecycle persistence, and physical schema guarantees

The identity relationship and storage contracts are documented in [IDENTITY_MODEL.md](IDENTITY_MODEL.md). B1.1 uses Prisma directly only in schema integration tests; it adds no business persistence boundary or HTTP surface.

The API does not eagerly connect Prisma during bootstrap. A PostgreSQL outage therefore does not kill the process: liveness remains independent, while the existing direct `pg` readiness probe reports the outage. The worker constructs the same shared infrastructure but performs no database query, queue work, or business processing.

## Explicitly not implemented

- frontend applications or UI
- authentication, passwords, password hashes, login, logout, or authorization
- sessions, refresh sessions, password reset, email verification, or phone OTP
- roles, permissions, membership roles, or authorization guards
- invitation workflow
- merchant, user, or staff APIs, controllers, or business services
- business persistence repositories
- customers or catalogue
- products or inventory
- orders or payments
- cash on delivery (COD)
- delivery, riders, or returns
- receipts
- policies or audit domain functionality
- outbox functionality
- BullMQ, queues, workers, or background jobs
- WhatsApp, MTN, or Airtel integrations
- Swagger or OpenAPI
- business functionality of any kind

Prisma remains exposed through infrastructure services; there are no identity repositories, business queries, services, controllers, or endpoints. No seed users or merchants exist.

These items belong to later reviewed steps and are outside B1.1. B1.2 has not started.
