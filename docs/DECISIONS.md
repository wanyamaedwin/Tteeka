# Architecture Decisions

## ADR-001: Modular monolith with a separate worker

- **Status:** Accepted
- **Decision:** Tteeka uses a modular monolith backend API with a separate worker process.
- **Rationale:** This establishes clear API and background-processing process boundaries while keeping backend code in one repository and avoiding premature service decomposition.

## ADR-002: npm workspace monorepo

- **Status:** Accepted
- **Decision:** Tteeka uses an npm workspace monorepo.
- **Rationale:** npm workspaces provide a minimal, native way to manage the API, worker, and shared backend packages together.

## ADR-003: Docker Compose for local data services

- **Status:** Accepted
- **Decision:** Tteeka uses Docker Compose to provide PostgreSQL and Redis for local development.
- **Rationale:** A two-service Compose environment gives backend developers consistent local data services with health checks and persistent volumes.
- **Scope:** This decision concerns local development infrastructure only. It does not define production deployment configuration.

## ADR-004: Shared schema-validated environment configuration

- **Status:** Accepted
- **Decision:** Tteeka uses one shared schema-validated environment configuration package for the API and worker.
- **Rationale:** Central validation provides consistent types, readable fail-fast startup errors, and one authoritative definition of critical application configuration.

## ADR-005: Separate liveness and readiness semantics

- **Status:** Accepted
- **Decision:** API liveness does not depend on external infrastructure; API readiness depends on PostgreSQL and Redis availability.
- **Rationale:** An infrastructure outage should make the API not ready for normal traffic without incorrectly declaring that the API process itself is dead.

## ADR-006: Data clients are health-only in B0.3

- **Status:** Accepted
- **Decision:** The PostgreSQL and Redis clients introduced in B0.3 are used only by infrastructure readiness probes.
- **Rationale:** Real dependency probes verify operational availability without prematurely introducing business persistence, caching, queues, or repositories.

## ADR-007: Prisma ORM for application persistence

- **Status:** Accepted
- **Decision:** Prisma ORM is Tteeka's application persistence ORM.
- **Rationale:** Prisma supplies a typed schema, client, and reviewed migration workflow while retaining PostgreSQL as the authoritative persistent store.

## ADR-008: PostgreSQL driver adapter for Prisma 7

- **Status:** Accepted
- **Decision:** Prisma 7 PostgreSQL connections use `@prisma/adapter-pg`.
- **Rationale:** Prisma 7 requires a driver adapter for runtime PostgreSQL connectivity, and the adapter uses the repository's established PostgreSQL driver family.

## ADR-009: Explicit repository-local Prisma Client output

- **Status:** Accepted
- **Decision:** Prisma Client is generated into `packages/database/src/generated/prisma`, is ignored by Git, and is regenerated from `prisma/schema.prisma`.
- **Rationale:** An explicit output satisfies Prisma 7, makes generation reproducible, and prevents generated-code churn in source control.

## ADR-010: Shared database infrastructure package

- **Status:** Accepted
- **Decision:** The API and worker construct Prisma through `@tteeka/database`.
- **Rationale:** One authoritative factory prevents divergent adapter, configuration, and lifecycle implementations between processes.

## ADR-011: Process-scoped Prisma clients

- **Status:** Accepted
- **Decision:** Each long-running API or worker process owns one Prisma Client rather than constructing clients per request, controller, or job.
- **Rationale:** Process scope avoids unnecessary PostgreSQL pools and gives shutdown cleanup a clear owner.

## ADR-012: Environment-specific migration commands

- **Status:** Accepted
- **Decision:** `prisma migrate dev` creates migrations only in development; `prisma migrate deploy` applies reviewed migrations outside development.
- **Rationale:** Production and staging must apply source-controlled migration history without generating or rewriting schema changes at deployment time.

## ADR-013: First migration deferred until a genuine domain model

- **Status:** Accepted
- **Decision:** B0.4 creates no migration; the first migration will accompany the first approved application model.
- **Rationale:** Artificial marker or health tables would create persistence concepts with no business meaning and pollute migration history.

## ADR-014: Readiness remains independent of Prisma persistence

- **Status:** Accepted
- **Decision:** The existing direct `pg` readiness probe remains authoritative and is not replaced by Prisma.
- **Rationale:** Lazy Prisma connectivity preserves B0.3 semantics: a temporary PostgreSQL outage makes readiness fail without terminating API liveness.

## ADR-015: PostgreSQL-generated UUIDv7 domain identifiers

- **Status:** Accepted
- **Decision:** Core domain identifiers use native PostgreSQL UUID columns with database-generated `uuidv7()` defaults.
- **Rationale:** UUIDv7 provides globally unique, time-ordered identifiers, while database generation keeps the identifier contract consistent for inserts inside and outside Prisma.

## ADR-016: User is a global human identity

- **Status:** Accepted
- **Decision:** `User` represents a human independently of any tenant and does not contain `merchantId`.
- **Rationale:** A person may work with more than one merchant, so embedding tenancy on User would incorrectly constrain the identity and duplicate people.

## ADR-017: MerchantMembership associates Users and Merchants

- **Status:** Accepted
- **Decision:** `MerchantMembership` provides the many-to-many association between `User` and `Merchant`.
- **Rationale:** An explicit association preserves global user identity while providing a place for merchant-scoped membership lifecycle and future merchant-scoped access concepts.

## ADR-018: Merchant and User membership pairs are unique

- **Status:** Accepted
- **Decision:** Each `(merchantId, userId)` pair is unique at the database level.
- **Rationale:** A second row for the same pair would represent a duplicate membership and create ambiguous lifecycle state.

## ADR-019: Canonical staff phone is initially required

- **Status:** Accepted
- **Decision:** `User.phoneE164` is required, globally unique, and stores canonical E.164 values in the Uganda-first identity model.
- **Rationale:** Phone is the initial universal staff identity contact. A future identity service must canonicalize the value before writes; B1.1 defines only the storage contract.

## ADR-020: User email is optional and unique when present

- **Status:** Accepted
- **Decision:** `User.email` is optional and globally unique for non-null values.
- **Rationale:** Email is useful but not universal in the initial target context. Future identity services must normalize it before writes; B1.1 does not add CITEXT or normalization logic.

## ADR-021: Roles are absent from the B1.1 identity foundation

- **Status:** Accepted
- **Decision:** B1.1 stores no role on `User` or `MerchantMembership`.
- **Rationale:** Roles are merchant-specific and require a separately reviewed authorization model. A global User role would violate tenant semantics, while a premature membership enum would constrain that future design.

## ADR-022: Core identities use lifecycle status and restricted deletion

- **Status:** Accepted
- **Decision:** Merchant, User, and MerchantMembership use lifecycle statuses, and membership foreign keys restrict physical deletion of referenced merchants and users.
- **Rationale:** Lifecycle changes preserve identity and membership history. Silent cascade deletion would destroy records needed for later operational and audit reasoning.

## ADR-023: Prisma and PostgreSQL use explicit naming mappings

- **Status:** Accepted
- **Decision:** Prisma uses PascalCase models and camelCase fields, while physical PostgreSQL objects use plural snake_case tables, snake_case columns, and explicit constraint and index names.
- **Rationale:** Each layer remains idiomatic, and deterministic physical names make migrations, diagnostics, and constraint errors stable and reviewable.

## ADR-024: Identity foundation is the first genuine migration

- **Status:** Accepted
- **Decision:** `20260809201741_identity_foundation` is Tteeka's first domain migration.
- **Rationale:** It introduces the first approved business-meaningful persistence structures without fake infrastructure tables or unrelated later-domain concepts.
