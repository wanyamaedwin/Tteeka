# Current State

## B1.7: Logout, logout-all, and Session revocation

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

B1.4 adds the opaque server-side Session foundation:

- a User-owned Session model with a one-to-many User relationship
- PostgreSQL UUIDv7 Session identifiers
- unique hash-only token persistence in `token_hash char(64)`
- 256-bit cryptographically random opaque token generation in `@tteeka/security`
- unpadded base64url token encoding and deterministic SHA-256 hashing
- explicit expiry, revocation, creation, and last-used lifecycle timestamps
- optional minimized User-Agent and IP-address diagnostic metadata
- a cascading dependent-security-data User foreign key while MerchantMembership restrictions remain effective
- PostgreSQL as authoritative Session persistence with no Redis Session storage
- the fourth domain migration: `20260810081341_session_foundation`
- cryptographic unit tests and real PostgreSQL integration tests covering hash-only storage, lifecycle, relations, metadata, indexes, constraints, and cleanup

The complete design boundary is documented in [SESSION_MODEL.md](SESSION_MODEL.md).

B1.5 adds the first authentication command:

- `POST /api/v1/auth/login` with Zod request validation
- Uganda phone normalization into canonical E.164 lookup values
- phone-and-password authentication through `@tteeka/security`
- one generic invalid-credential response for unknown phone, wrong password, missing credential, and DISABLED User
- a reusable in-memory dummy Argon2 verification path for missing credentials
- ACTIVE global User enforcement without requiring a MerchantMembership
- transparent outdated Argon2 parameter upgrades that preserve `passwordChangedAt`
- configurable `SESSION_TTL_SECONDS`, defaulting to 43,200 seconds (12 hours)
- a fresh opaque Session and hash-only PostgreSQL persistence per successful login
- `tteeka_session` HttpOnly, SameSite=Lax cookie issuance with environment-derived Secure behavior
- a safe JSON response containing only User ID/display name and Session expiry
- no-store/no-cache response headers
- truncated User-Agent and framework-resolved IP Session metadata
- a narrow Auth persistence boundary with a Prisma infrastructure implementation
- real HTTP/PostgreSQL coverage for successful and failed login, cookies, Session storage, multiple Sessions, no-Membership authentication, and password rehashing

See [LOGIN_FLOW.md](LOGIN_FLOW.md) for the full command and security boundary.

B1.6 adds authenticated request resolution without a schema migration:

- standard unsigned Express cookie parsing for `tteeka_session`
- strict 43-character/32-byte base64url Session-token validation before hashing or persistence access
- centralized SHA-256 lookup through `@tteeka/security`
- narrow Auth-store Session lookup with no credentials or authorization relationships selected
- rejection of missing, malformed, unknown, revoked, expired, exact-boundary, and DISABLED-User Sessions with one generic 401 response
- propagation of genuine lookup infrastructure failures through 500-class error handling
- an explicit safe `AuthenticatedPrincipal` attached at `request.auth`
- route-scoped `SessionAuthGuard` protection for `GET /api/v1/auth/me`
- a safe `/me` response containing only User ID/display name and absolute Session expiry
- no-store/no-cache response headers and no cookie renewal
- configurable `SESSION_TOUCH_INTERVAL_SECONDS`, defaulting to five minutes
- concurrency-safe, best-effort conditional `lastUsedAt` touching that changes no other Session field
- continued public access to login and health endpoints

See [AUTHENTICATED_REQUESTS.md](AUTHENTICATED_REQUESTS.md) for the complete resolution and deferred-security boundary.

B1.7 adds explicit Session revocation without a schema migration:

- unguarded, idempotent `POST /api/v1/auth/logout` for current-Session revocation and safe stale-cookie clearing
- guarded `POST /api/v1/auth/logout-all` using only the trusted `AuthenticatedPrincipal` global User ID
- conditional current-Session revocation by SHA-256 token hash
- one conditional bulk update for every unrevoked Session belonging to the User
- current Session and expired-but-unrevoked Session inclusion in logout-all
- first-revocation timestamp preservation for already-revoked Sessions
- Session-history preservation with no logout hard deletion or automatic cleanup
- `tteeka_session` removal with shared Path, HttpOnly, SameSite, Secure, and host-only policy
- no-store/no-cache 204 responses with no response body or Session count
- other-User isolation and support for authenticated Users with zero MerchantMemberships
- PostgreSQL remaining authoritative with no Redis Session state

See [SESSION_REVOCATION.md](SESSION_REVOCATION.md) for the complete behavior and security boundary.

The API does not eagerly connect Prisma during bootstrap. A PostgreSQL outage therefore does not kill the process: liveness remains independent, while the existing direct `pg` readiness probe reports the outage. The worker constructs the same shared infrastructure but performs no database query, queue work, or business processing.

## Explicitly not implemented

- frontend applications or UI
- Session listing or device/session management APIs
- logout-other-sessions-only or administrator Session revocation
- account registration or password-change APIs
- Session deletion, automatic cleanup, or retention jobs
- JWTs, bearer/access tokens, or refresh tokens
- Session renewal, rotation, sliding expiration, retention cleanup, or Redis Session storage
- a global authentication guard or global public/private route metadata
- Merchant context, Membership resolution, Role resolution, or Permission resolution during authentication
- authorization guards, permission guards, or authorization execution
- CSRF defense for future authenticated state-changing browser requests
- password-reset tokens or password-reset workflow
- email verification, phone verification, or OTP
- default Permissions, default Roles, Permission seeding, or Role seeding
- `AuthorizationModule`, authorization services, permission resolution, guards, or decorators
- role-management or staff-management APIs
- invitation workflow
- rate limiting, brute-force protection, account lockout, failed-login counters, MFA, or passkeys
- email login
- merchant, user, or staff APIs, controllers, or business services
- business persistence repositories
- customers or catalogue
- products or inventory
- orders or payments
- cash on delivery (COD)
- delivery, riders, or returns
- receipts
- authorization execution, policies, or audit domain functionality
- outbox functionality
- BullMQ, queues, workers, or background jobs
- WhatsApp, MTN, or Airtel integrations
- Swagger or OpenAPI
- business functionality of any kind

Prisma remains exposed through infrastructure services and the narrow Auth store; there are no general identity repositories or business APIs. No seed users or merchants exist.

These items belong to later reviewed steps and are outside B1.7. B1.8 has not started.
