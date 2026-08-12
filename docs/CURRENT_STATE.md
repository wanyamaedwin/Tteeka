# Current State

## B2.2: Staff, Membership, and Role administration

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

B1.8 adds merchant-scoped authorization resolution without a schema migration:

- an explicit `GET /api/v1/merchants/:merchantId/context` route guarded first by Session authentication and then Merchant context
- UUIDv7 Merchant ID structural validation before persistence access
- one generic 403 result for unknown Merchants, absent or non-ACTIVE Memberships, and non-ACTIVE Merchants
- one focused authorization-store lookup scoped by authenticated User and requested Merchant
- ACTIVE Role and ACTIVE Permission lifecycle filtering
- valid zero-Role Memberships and zero-Permission Roles
- unioned, deduplicated, deterministically sorted effective Permission keys
- deterministic Role ordering by name and ID
- safe no-store response mapping with no Session renewal or cookie mutation
- separate `request.auth` and `request.merchantContext` boundaries
- exact, case-sensitive pure Permission evaluation with explicit empty-list semantics
- PostgreSQL-authoritative resolution on every request with no Session or Redis authorization cache
- immediate visibility of Merchant, Membership, Role, and Permission lifecycle changes
- multi-Merchant context isolation for one authenticated global User
- no Permission requirement decorator, enforcement guard, or protected business endpoint

See [MERCHANT_CONTEXT.md](MERCHANT_CONTEXT.md) for the complete behavior and deferred-enforcement boundary.

B1.9 adds declarative exact-Permission enforcement without a schema migration or production route:

- `@RequirePermission(permissionKey)` with one centralized metadata key
- exact preservation of non-empty developer-supplied Permission keys
- class-level and method-level requirements with method-over-class precedence
- route-scoped `PermissionGuard` registered through `AuthorizationModule`
- enforcement against the existing request-local `ResolvedMerchantContext`
- exclusive delegation to the existing `PermissionEvaluator`
- generic HTTP 403 denial when the exact required Permission is absent
- generic 500-class failure for missing metadata or missing Merchant context
- the required `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard` composition
- no second authorization query and no mutation of authentication or Merchant context
- real PostgreSQL/HTTP proof through a test-only controller absent from production modules
- immediate Role, Permission, Membership, and Merchant lifecycle effects without re-login
- cross-Merchant and other-User isolation with no Session mutation
- continued B1.8 context-endpoint access for ACTIVE zero-Role Memberships
- no global guard, Permission cache, wildcard, deny, or Role-name bypass semantics

See [PERMISSION_ENFORCEMENT.md](PERMISSION_ENFORCEMENT.md) for the merchant-route usage and failure contract. The B1 authentication and authorization foundation is complete after B1.9.

B2.1 adds the first real Merchant business module without a schema migration:

- `MerchantModule`, kept separate from Auth and Authorization modules
- `GET` and `PATCH /api/v1/merchants/:merchantId/profile`
- `GET` and `PATCH /api/v1/merchants/:merchantId/settings`
- the complete route-scoped `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard` pipeline on all four routes
- canonical `merchant.profile.read`, `merchant.profile.manage`, `merchant.settings.read`, and `merchant.settings.manage` application constants
- exact Permission separation with no manage-implies-read behavior
- context-authoritative Merchant IDs and a narrow Merchant-only store
- strict non-empty PATCH validation with unknown-field rejection
- shared Uganda phone normalization used by login and Merchant profile updates
- trimmed/lowercased Merchant email normalization without a uniqueness constraint
- uppercase three-letter currency normalization and built-in IANA timezone validation
- bounded, no-store responses with no Session or cookie mutation
- tenant-safe PostgreSQL-backed profile/settings persistence and HTTP coverage
- no generic settings table, JSON blob, automatic Permission seeding, status API, audit/outbox, or domain-policy settings

See [MERCHANT_PROFILE_SETTINGS.md](MERCHANT_PROFILE_SETTINGS.md) for the complete API, validation, ownership, and deferred-domain boundary.

B2.2 adds tenant-safe authorization administration without a schema migration:

- a separate `AccessManagementModule` for staff, Membership, Role, and grant administration
- Merchant staff listing and existing-ACTIVE-User Membership creation
- ACTIVE/DISABLED Membership lifecycle with retained Role links
- transactional exact MembershipRole replacement
- Merchant Role listing, creation, editing, disabling, and reactivation
- transactional exact RolePermission replacement
- four exact administration Permissions with no manage-implies-read behavior
- an eight-key code-owned application Permission catalog
- explicit, idempotent `npm run permissions:sync` with no startup seeding or default Roles
- unknown/disabled-User enumeration safety and safe uniqueness-conflict handling
- tenant-safe target resolution and immediate PostgreSQL-authoritative authorization changes without Session revocation
- bounded no-store responses and real HTTP/PostgreSQL coverage

See [STAFF_ROLE_ADMINISTRATION.md](STAFF_ROLE_ADMINISTRATION.md) for API contracts, lifecycle rules, exact replacement behavior, synchronization, and deferred onboarding/audit boundaries.

B3.1 adds the first core commerce aggregate and fifth migration:

- Merchant-owned Product persistence with UUIDv7 identifiers
- ACTIVE, INACTIVE, and ARCHIVED reversible lifecycle states with no hard delete
- strict Product create, list, detail, and update APIs
- bounded nullable description/category/brand metadata
- case-insensitive basic search and category/brand filtering
- deterministic name/ID ordering and offset pagination
- exact `catalogue.read` and `catalogue.manage` enforcement
- a ten-key application Permission catalog and unchanged explicit synchronization
- PostgreSQL-backed tenant-isolation, lifecycle, filter, pagination, and HTTP coverage

See [PRODUCT_CATALOGUE.md](PRODUCT_CATALOGUE.md) for the complete B3.1 contract.

B3.2 adds sellable ProductVariant identity and the sixth migration:

- Merchant/Product-bound ProductVariant persistence with database-enforced composite tenant foreign keys and UUIDv7 IDs
- required Merchant-scoped canonical uppercase SKU and optional Merchant-scoped case-preserving barcode
- nullable bounded size/colour metadata with no generic JSON options
- INACTIVE default plus ACTIVE/INACTIVE/ARCHIVED lifecycle, where ACTIVE requires current price
- dedicated Variant create, list, detail, update, and exact Merchant-wide SKU/barcode lookup APIs
- current positive selling price, optional nonnegative cost, and signed-BIGINT-safe string JSON representation
- explicit Merchant currency snapshots that are not rewritten by later Merchant setting changes
- append-only VariantPriceHistory with tenant-safe foreign key, deterministic pagination, and immutable old currency states
- PostgreSQL row-locked transactional price updates with identical-PUT idempotence
- cost privacy on normal catalogue reads and cost visibility only on price-management responses
- exact independent `catalogue.read`, `catalogue.manage`, and `catalogue.price.manage` Permissions
- a thirteen-key application Permission catalog and unchanged explicit idempotent synchronization
- seven new guarded routes, bringing the production route total to 31
- real PostgreSQL concurrency and real HTTP coverage for isolation, conflicts, permissions, lifecycle, pricing, Session immutability, and outage behavior

See [PRODUCT_VARIANTS_PRICING.md](PRODUCT_VARIANTS_PRICING.md) for the complete B3.2 contract.

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
- Merchant context, Membership resolution, Role resolution, or Permission resolution during authentication itself
- business routes beyond the implemented Merchant, access-management, catalogue/pricing, inventory/holds, customer/delivery-location, and draft-order surfaces
- multi-Permission requirement metadata or any/all route composition
- CSRF defense for future authenticated state-changing browser requests
- password-reset tokens or password-reset workflow
- email verification, phone verification, or OTP
- default Owner/Admin/Manager Roles or automatic startup Permission synchronization
- a global PermissionGuard, other global authorization guard, `APP_GUARD`, or `@Public` infrastructure
- wildcard Permissions, deny rules, Permission inheritance, or hierarchical Roles
- Owner/Admin bypass or Role-name authorization
- authorization Session snapshots, Redis authorization cache, or other long-lived authorization cache
- signup, invitation, or staff account-onboarding workflow
- User profile/status administration
- Permission CRUD APIs
- rate limiting, brute-force protection, account lockout, failed-login counters, MFA, or passkeys
- email login
- Merchant creation, deletion, or status-management APIs
- User or staff administration APIs
- Role hierarchy, inheritance, wildcard, deny, or Owner/Admin bypass semantics
- warehouses/bins, transfers, fulfillment stock states, or availability booleans
- discounts, promotions, scheduled/bulk pricing, tax/VAT, or FX conversion
- Product or Variant images/media
- Category or Brand CRUD/tables, public storefront, or customer-facing Product visibility
- customer authentication accounts, customer analytics, loyalty, or WhatsApp conversations
- Order confirmation, payments, fulfilment, or completion
- cash on delivery (COD) settings or behavior
- order-owned holds, partial release, or stock-hold policy settings
- delivery settings, riders, or returns settings
- receipts
- access-management audit history or business-policy domain functionality
- outbox functionality
- BullMQ, queues, workers, or background jobs
- WhatsApp, MTN, or Airtel integrations
- Swagger or OpenAPI

Prisma remains exposed through infrastructure services and narrow Auth, Authorization, Merchant, and AccessManagement stores; there are no general repositories. No seed Users, Merchants, or Roles exist. Permission synchronization is an explicit operational command only.

These items belong to later reviewed steps and remain outside the completed B4.2 scope.

# B4.1 — Inventory ledger and stock availability

B4.1 provides an append-only inventory ledger, AVAILABLE inventory state, transactional `InventoryBalance` projection, receipts, positive/negative manual adjustments, negative-stock prevention, inventory list/detail/history, domain-local idempotency, PostgreSQL row-lock concurrency, `inventory.read`/`inventory.manage`, a 13-key production Permission catalog, and the seventh migration.

Not implemented: HELD stock, StockHold or expiry, reservations, packed/in-transit states, warehouse/bin/transfer, orders or sale consumption, return inspection, inventory audit/outbox, or Redis stock caching.

# B4.2 — Stock holds and reservation expiry

B4.2 adds Merchant/Variant-scoped StockHold persistence, ACTIVE/RELEASED/EXPIRED lifecycle, effective time-based expiry, held and sellable inventory projections, five guarded APIs, create idempotency, expiry updates, lifecycle-idempotent release, and an internal bounded `SKIP LOCKED` expiry processor in the eighth migration.

Physical AVAILABLE and the three B4.1 movement types remain unchanged. Holds never alter the ledger or balance. Hold creation and outbound movement lock the same AVAILABLE row, preventing concurrent oversell and preventing physical stock from falling below effective active reservations. Production now has 40 guarded routes and 13 Permission keys.

Not implemented: order/checkout ownership, sale consumption, partial release, warehouse/bin/transfer, fulfillment states, a scheduler/queue, notifications, Redis stock caching, inventory audit/outbox, or generic B14 idempotency.

See [STOCK_HOLDS.md](STOCK_HOLDS.md) for the full contract.

# B5 — Customers and delivery locations

B5 adds Merchant-owned Customer identities and reusable DeliveryLocations in the ninth migration. Customer and location phones use the shared Uganda normalization rules; Customer phone uniqueness is per Merchant and survives archive. Both models have independent ACTIVE/ARCHIVED lifecycles and no hard-delete APIs.

Eight guarded routes provide strict create, list, detail, and PATCH operations. Customer lists support search, exact normalized phone and status filters, and bounded pagination; location lists are Customer-scoped with status filtering and bounded pagination. `customers.read` and `customers.manage` are independent exact grants, expanding production to 48 routes and 15 Permission keys. Tenant-safe composite ownership and generic not-found behavior prevent cross-Merchant and cross-Customer disclosure.

B5 adds no User linkage, Order or Reservation model, StockHold customer field, default address, postal-address abstraction, delivery zone/fee/rider, WhatsApp records, analytics, or Redis cache. See [CUSTOMERS_DELIVERY_LOCATIONS.md](CUSTOMERS_DELIVERY_LOCATIONS.md).

# B6.1 — Draft orders and commercial snapshots

B6.1 adds the central Merchant-owned Order aggregate and OrderItems in the tenth migration. Draft creation snapshots active Customer and optional active DeliveryLocation identity; desired-state item replacement snapshots active Product/Variant identity and current price without consulting inventory. BIGINT-safe line totals and single-currency subtotal are server-authoritative.

The complete frozen status enum is DRAFT, CONFIRMED, FULFILLED, COMPLETED, ABANDONED, and CANCELLED, while B6.1 implements only DRAFT creation plus idempotent abandon/cancel commands. Eight guarded routes bring production to 56 routes. Exact independent `orders.read` and `orders.manage` grants bring the explicit catalog to 17 keys.

PostgreSQL row locks serialize DRAFT edits and terminal transitions. B6.1 adds no confirmation, StockHold linkage, reservation, inventory movement, Payment/COD, delivery operation, discount/tax, friendly order number, or Redis cache. See [DRAFT_ORDERS.md](DRAFT_ORDERS.md).

# B6.2 — Order confirmation and StockHold coordination

B6.2 adds the eleventh migration and one `orders.manage` confirmation route, bringing production to 57 routes while the explicit Permission catalogue remains 17 keys. Confirmation atomically moves a nonempty Order from DRAFT to CONFIRMED and creates exactly one tenant-safe OrderItem-owned StockHold per line under deterministic PostgreSQL row locks.

The command is Merchant-scoped idempotent, all-or-nothing, snapshot-preserving, catalogue-lifecycle independent, and shares Inventory's AVAILABLE-row capacity authority. It changes neither physical InventoryBalance nor InventoryLedgerEntry. Order reads expose safe effective Hold summaries through `orders.read`; generic Inventory APIs conceal Order linkage and cannot independently release or reschedule Order-managed Holds.

CONFIRMED Orders may transition to CANCELLED, atomically releasing active Holds and expiring due Holds. Hold expiry never changes Order status and causes no automatic re-reservation. Fulfilment, completion, payment, delivery, consumption, receipts, scheduling, audit, and outbox remain absent. See [ORDER_CONFIRMATION_STOCK_HOLDS.md](ORDER_CONFIRMATION_STOCK_HOLDS.md).
