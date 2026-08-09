# Current State

## B0.1: Repository and TypeScript/NestJS engineering foundation

The repository contains a backend-only npm workspace monorepo targeting Node.js 24 LTS.

Implemented in B0.1:

- npm workspaces for `apps/*` and `packages/*`
- shared strict TypeScript configuration
- ESLint and Prettier configuration
- repository-wide format, lint, typecheck, test, and build commands
- development commands for the API and worker
- a minimal NestJS 11 API bootstrap with an empty root module
- a minimal standalone TypeScript worker entry point
- placeholder shared `config` and `testing` packages
- repository documentation and architecture decision records

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

These items belong to later steps and are outside B0.1.
