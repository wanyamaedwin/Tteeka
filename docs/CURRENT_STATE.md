# Current State

## B0.2: PostgreSQL and Redis local development infrastructure

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

The API has no controllers, services, domain modules, database connections, or generated OpenAPI description. The worker has no job or queue processing.

## Explicitly not implemented

- frontend applications or UI
- authentication or authorization
- customers
- products
- orders
- payments
- inventory
- cash on delivery (COD)
- delivery
- returns
- receipts
- PostgreSQL or any other database
- Prisma or any other ORM
- Redis
- BullMQ or any other queue
- Docker or container configuration
- Swagger or OpenAPI
- business functionality of any kind

In particular, Prisma, database schemas, migrations, and BullMQ are not implemented. The API is not connected to PostgreSQL or Redis. The worker is not connected to either service. No Tteeka business data models exist.

These items belong to later steps and are outside B0.2.
