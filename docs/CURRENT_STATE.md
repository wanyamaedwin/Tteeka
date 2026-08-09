# Current State

## B1.3: Roles, permissions, and merchant-scoped authorization data model

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

B1.2 adds the minimum password credential foundation:

- a `PasswordCredential` model kept separate from the global `User` identity
- an optional one-to-one User relationship enforced by unique `user_id`
- PostgreSQL UUIDv7 credential identifiers and `timestamptz(3)` timestamps
- encoded Argon2 PHC storage in `password_hash varchar(512)`
- an intentional `ON DELETE CASCADE` for dependent credential material while membership restrictions remain intact
- the independent `@tteeka/security` workspace package
- Argon2id hashing with explicit memory, time, parallelism, and hash-length parameters
- secure password verification with deterministic malformed-hash handling
- rehash detection for future successful-login upgrades without automatic persistence
- the second reviewed domain migration: `20260809210042_password_credentials`
- cryptographic unit tests and real PostgreSQL credential integrity tests

The credential storage, hashing rules, and future boundaries are documented in [PASSWORD_CREDENTIALS.md](PASSWORD_CREDENTIALS.md). Database integration tests use `@tteeka/security` as a development-only dependency to prove that only encoded hashes cross the persistence boundary.

B1.3 adds the merchant-scoped authorization persistence foundation:

- a global `Permission` capability vocabulary with `ACTIVE` and `DEPRECATED` lifecycle
- merchant-scoped `Role` records with `ACTIVE` and `DISABLED` lifecycle
- explicit `MembershipRole` records supporting multiple Roles per Membership and multiple Memberships per Role
- explicit `RolePermission` records supporting multiple Permissions per Role and global Permission reuse across Merchants
- merchant-local Role-name uniqueness and globally unique Permission keys
- tenant ownership carried on authorization assignment records
- supporting `(merchant_id, id)` uniqueness on Role and MerchantMembership
- composite foreign keys that make PostgreSQL reject cross-merchant MembershipRole and RolePermission writes
- deliberate cascade deletion for dependent assignment rows and restrictive deletion for referenced Merchants and Permissions
- PostgreSQL UUIDv7 identifiers and `timestamptz(3)` timestamps
- the third reviewed domain migration: `20260809213158_authorization_foundation`
- real PostgreSQL tests for defaults, uniqueness, cardinality, lifecycle persistence, referential actions, direct tenant attacks, and database catalog guarantees

The model and tenant-boundary design are documented in [AUTHORIZATION_MODEL.md](AUTHORIZATION_MODEL.md). B1.3 contains no Role or Permission seed data and no authorization decision engine.

The API does not eagerly connect Prisma during bootstrap. A PostgreSQL outage therefore does not kill the process: liveness remains independent, while the existing direct `pg` readiness probe reports the outage. The worker constructs the same shared infrastructure but performs no database query, queue work, or business processing.

## Explicitly not implemented

- frontend applications or UI
- login, logout, or request authentication
- authentication controllers, services, or `AuthModule`
- account registration or password-change APIs
- sessions, cookies, JWTs, access tokens, or refresh tokens
- password-reset tokens or password-reset workflow
- email verification, phone verification, or OTP
- default Permissions, default Roles, Permission seeding, or Role seeding
- `AuthorizationModule`, authorization services, permission resolution, guards, or decorators
- role-management or staff-management APIs
- invitation workflow
- rate limiting, account lockout, failed-login counters, MFA, or passkeys
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

These items belong to later reviewed steps and are outside B1.3. B1.4 has not started.
