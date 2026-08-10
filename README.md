# Tteeka Backend

Tteeka is a Uganda-first WhatsApp Commerce Operating System. This repository currently contains the backend foundation through B1.5.

## Requirements

- Node.js 24 LTS
- npm
- Docker Desktop or Docker Engine with Docker Compose

With a Node version manager, use the version declared in `.nvmrc` before installing dependencies.

## Repository layout

- `apps/api` — NestJS 11 API with operational health endpoints
- `apps/worker` — configuration-aware standalone TypeScript worker process
- `packages/config` — shared schema-validated application configuration
- `packages/database` — shared Prisma persistence infrastructure
- `packages/security` — shared Argon2id password and opaque-session token cryptography
- `packages/testing` — placeholder for future shared testing utilities
- `prisma` — Prisma schema and source-controlled migrations
- `docs` — current-state and architecture decision documentation

## Setup

```sh
npm install
npm run prisma:generate
```

## Local infrastructure

Create a local environment file in PowerShell:

```powershell
Copy-Item .env.example .env
```

Start PostgreSQL 18 and Redis 8, then check their status:

```sh
npm run infra:up
npm run infra:status
```

Stop the containers without deleting their persistent volumes:

```sh
npm run infra:down
```

The example configuration binds PostgreSQL to `127.0.0.1:5432` and Redis to `127.0.0.1:6379`. `POSTGRES_*` and `REDIS_PORT` configure the local Docker containers.

Application configuration is validated at startup:

- `NODE_ENV` selects `development`, `test`, `staging`, or `production`
- `API_PORT` selects the API listen port
- `DATABASE_URL` configures the PostgreSQL readiness probe
- `REDIS_URL` configures the Redis readiness probe
- `INFRA_HEALTH_TIMEOUT_MS` limits each infrastructure check

`DATABASE_URL` is also used by Prisma CLI migration commands and by the shared database package. It is defined only in local or deployment environment configuration and is never logged.

If local container ports differ from the defaults, update both the Docker port variables and the matching port in `DATABASE_URL` or `REDIS_URL` in the ignored `.env` file.

## Development

```sh
npm run dev:api
npm run dev:worker
```

The API listens on `API_PORT`, which defaults to `3000`. The worker validates the same shared configuration but does not process queues or jobs.

## Health endpoints

With the API running, these endpoints are available:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

Liveness returns HTTP `200` whenever the API process is alive and does not depend on PostgreSQL or Redis. Readiness executes PostgreSQL `SELECT 1` and Redis `PING`; it returns HTTP `200` only when both checks pass, otherwise HTTP `503` with per-service `up` or `down` status.

## Prisma and database commands

Validate and format the schema, then generate the ignored repository-local client:

```sh
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
```

With local infrastructure running, prove the complete Prisma-to-PostgreSQL path and inspect migration status:

```sh
npm run db:check
npm run prisma:migrate:status
```

Apply the reviewed identity foundation migration in development, then regenerate the client:

```sh
npm run prisma:migrate:dev
npm run prisma:generate
```

For future schema changes, generate a named migration with `npm run prisma:migrate:dev -- --name <migration_name> --create-only`, review the SQL, and only then apply it with `npm run prisma:migrate:dev`.

`npm run prisma:migrate:deploy` only applies reviewed, committed migrations and is the migration command for staging and production. It does not create new migrations. B1.1's `identity_foundation` migration introduces Merchant, User, and MerchantMembership; B1.2's `password_credentials` migration adds optional one-to-one password credentials; B1.3's `authorization_foundation` migration adds merchant-scoped Roles, global Permissions, and tenant-safe explicit assignment records; B1.4's `session_foundation` migration adds User-owned opaque Session persistence.

The password hashing utilities live in `@tteeka/security`. They provide Argon2id hashing, verification, and rehash detection used by the login flow.

The opaque Session persistence foundation now exists. `@tteeka/security` generates 256-bit base64url Session secrets and deterministic SHA-256 lookup hashes; only hashes belong in PostgreSQL. Authenticated request resolution is not implemented. See [docs/SESSION_MODEL.md](docs/SESSION_MODEL.md).

`POST /api/v1/auth/login` now authenticates an ACTIVE User by normalized Uganda phone and password, creates a fresh opaque Session, and returns its raw token only through an HttpOnly cookie. Authenticated request resolution, logout, rate limiting, and authorization execution are not implemented. See [docs/LOGIN_FLOW.md](docs/LOGIN_FLOW.md).

The merchant-scoped authorization data model now exists, including database-enforced protection against cross-merchant role assignments. Authorization decisions, guards, decorators, default Roles and Permissions, and role-management APIs are not implemented. See [docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md).

## Validation

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Use `npm run format` to apply Prettier formatting.

The test command includes real identity-schema integration tests and therefore requires the local PostgreSQL infrastructure with the migration applied.

See [docs/IDENTITY_MODEL.md](docs/IDENTITY_MODEL.md) for identity relationships, [docs/PASSWORD_CREDENTIALS.md](docs/PASSWORD_CREDENTIALS.md) for credential storage and hashing boundaries, [docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md) for merchant-scoped authorization persistence, [docs/SESSION_MODEL.md](docs/SESSION_MODEL.md) for opaque Sessions, [docs/LOGIN_FLOW.md](docs/LOGIN_FLOW.md) for login and cookie issuance, [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) for the exact implementation boundary, and [docs/DATABASE_CONVENTIONS.md](docs/DATABASE_CONVENTIONS.md) for persistence and migration rules.
