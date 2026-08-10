# Tteeka Backend

Tteeka is a Uganda-first WhatsApp Commerce Operating System. This repository contains the completed B1 authentication and authorization foundation plus B2.1 Merchant profile and core operational settings.

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

The opaque Session persistence foundation now exists. `@tteeka/security` generates and validates 256-bit base64url Session secrets and produces deterministic SHA-256 lookup hashes; only hashes belong in PostgreSQL. See [docs/SESSION_MODEL.md](docs/SESSION_MODEL.md).

`POST /api/v1/auth/login` authenticates an ACTIVE User by normalized Uganda phone and password, creates a fresh opaque Session, and returns its raw token only through an HttpOnly cookie. `GET /api/v1/auth/me` resolves that cookie into safe User/Session context. `POST /api/v1/auth/logout` revokes the current Session idempotently, and guarded `POST /api/v1/auth/logout-all` revokes all Sessions for the authenticated global User. Revoked Session rows are retained rather than deleted. See [docs/LOGIN_FLOW.md](docs/LOGIN_FLOW.md), [docs/AUTHENTICATED_REQUESTS.md](docs/AUTHENTICATED_REQUESTS.md), and [docs/SESSION_REVOCATION.md](docs/SESSION_REVOCATION.md).

The merchant-scoped authorization data model includes database-enforced protection against cross-merchant role assignments. Authenticated callers can resolve current context through `GET /api/v1/merchants/:merchantId/context`; Session authentication and Merchant authorization remain separate request contexts, and PostgreSQL lifecycle state is authoritative on every request.

B2.1 adds the first production business routes using the route-scoped `PermissionGuard`:

```text
GET   /api/v1/merchants/:merchantId/profile
PATCH /api/v1/merchants/:merchantId/profile
GET   /api/v1/merchants/:merchantId/settings
PATCH /api/v1/merchants/:merchantId/settings
```

They expose bounded Merchant profile and core currency/timezone settings through exact canonical Permissions. COD, stock-hold, delivery, returns, and other domain-specific policies remain deferred. See [docs/MERCHANT_PROFILE_SETTINGS.md](docs/MERCHANT_PROFILE_SETTINGS.md).

B2.2 makes the authorization graph administrable through nine exact-Permission routes:

```text
GET   /api/v1/merchants/:merchantId/staff
POST  /api/v1/merchants/:merchantId/staff
PATCH /api/v1/merchants/:merchantId/staff/:membershipId
PUT   /api/v1/merchants/:merchantId/staff/:membershipId/roles
GET   /api/v1/merchants/:merchantId/roles
POST  /api/v1/merchants/:merchantId/roles
PATCH /api/v1/merchants/:merchantId/roles/:roleId
PUT   /api/v1/merchants/:merchantId/roles/:roleId/permissions
GET   /api/v1/merchants/:merchantId/permissions
```

Staff addition currently targets an existing ACTIVE Tteeka User; signup and invitations remain deferred. Run `npm run permissions:sync` explicitly to create/synchronize the thirteen-key code-owned Permission catalog. The command never creates default Roles and does not run at API startup. See [docs/STAFF_ROLE_ADMINISTRATION.md](docs/STAFF_ROLE_ADMINISTRATION.md).

B3.1 adds the first Product Catalogue routes:

```text
GET   /api/v1/merchants/:merchantId/products
POST  /api/v1/merchants/:merchantId/products
GET   /api/v1/merchants/:merchantId/products/:productId
PATCH /api/v1/merchants/:merchantId/products/:productId
```

`catalogue.read` protects Product list/detail and `catalogue.manage` protects create/update with no implied hierarchy. See [docs/PRODUCT_CATALOGUE.md](docs/PRODUCT_CATALOGUE.md).

B3.2 adds seven ProductVariant and pricing routes:

```text
GET   /api/v1/merchants/:merchantId/products/:productId/variants
POST  /api/v1/merchants/:merchantId/products/:productId/variants
GET   /api/v1/merchants/:merchantId/products/:productId/variants/:variantId
PATCH /api/v1/merchants/:merchantId/products/:productId/variants/:variantId
PUT   /api/v1/merchants/:merchantId/products/:productId/variants/:variantId/price
GET   /api/v1/merchants/:merchantId/products/:productId/variants/:variantId/price-history
GET   /api/v1/merchants/:merchantId/variants/lookup
```

`catalogue.read`, `catalogue.manage`, and `catalogue.price.manage` remain exact independent Permissions. The application catalog now contains thirteen production keys after B4.1. BIGINT money is represented as JSON decimal strings, Merchant currency is snapshotted on explicit price changes, normal catalogue reads hide cost, and price history is append-only. See [docs/PRODUCT_VARIANTS_PRICING.md](docs/PRODUCT_VARIANTS_PRICING.md).

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

See [docs/PRODUCT_VARIANTS_PRICING.md](docs/PRODUCT_VARIANTS_PRICING.md) for B3.2 sellable catalogue identity and pricing, [docs/STAFF_ROLE_ADMINISTRATION.md](docs/STAFF_ROLE_ADMINISTRATION.md) for B2.2 access administration, [docs/MERCHANT_PROFILE_SETTINGS.md](docs/MERCHANT_PROFILE_SETTINGS.md) for B2.1 business routes, [docs/IDENTITY_MODEL.md](docs/IDENTITY_MODEL.md) for identity relationships, [docs/PASSWORD_CREDENTIALS.md](docs/PASSWORD_CREDENTIALS.md) for credential storage and hashing boundaries, [docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md) for merchant-scoped authorization persistence, [docs/MERCHANT_CONTEXT.md](docs/MERCHANT_CONTEXT.md) for context resolution, [docs/PERMISSION_ENFORCEMENT.md](docs/PERMISSION_ENFORCEMENT.md) for declarative exact-Permission enforcement, [docs/SESSION_MODEL.md](docs/SESSION_MODEL.md) for opaque Sessions, [docs/LOGIN_FLOW.md](docs/LOGIN_FLOW.md) for login and cookie issuance, [docs/AUTHENTICATED_REQUESTS.md](docs/AUTHENTICATED_REQUESTS.md) for protected-request resolution, [docs/SESSION_REVOCATION.md](docs/SESSION_REVOCATION.md) for logout behavior, [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) for the exact implementation boundary, and [docs/DATABASE_CONVENTIONS.md](docs/DATABASE_CONVENTIONS.md) for persistence and migration rules.

# B4.1 inventory

Inventory administration adds four routes:

- `GET /api/v1/merchants/:merchantId/inventory`
- `GET /api/v1/merchants/:merchantId/inventory/:variantId`
- `GET /api/v1/merchants/:merchantId/inventory/:variantId/ledger`
- `POST /api/v1/merchants/:merchantId/inventory/:variantId/movements`

Reads require `inventory.read`; stock commands require the independent `inventory.manage` permission and an `Idempotency-Key` header. The application Permission catalog now has 13 production keys. See [Inventory ledger](docs/INVENTORY_LEDGER.md). B4.2 introduces stock holds; they are not part of B4.1.
