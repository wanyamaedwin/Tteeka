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

## ADR-025: Password credentials are separate from User

- **Status:** Accepted
- **Decision:** Password authentication material is stored in `PasswordCredential`, not directly on `User`.
- **Rationale:** User remains the global human identity while credentials represent one attachable authentication mechanism. This avoids redesigning User when future mechanisms are evaluated.

## ADR-026: Argon2id password hashing

- **Status:** Accepted
- **Decision:** Tteeka hashes passwords with Argon2id.
- **Rationale:** Argon2id provides a memory-hard password hashing construction with balanced resistance to side-channel and tradeoff attacks. Competing password algorithms are not introduced.

## ADR-027: Explicit password hashing parameters

- **Status:** Accepted
- **Decision:** Tteeka centrally sets Argon2 memory cost to 19,456 KiB, time cost to 2, parallelism to 1, and hash length to 32 bytes.
- **Rationale:** Security behavior must not change silently when a dependency changes its defaults. Central configuration also provides one reviewed baseline for rehash decisions.

## ADR-028: PHC-encoded password hash storage

- **Status:** Accepted
- **Decision:** `password_hash` stores only the encoded Argon2 PHC string; salts and hashing parameters are not duplicated into separate columns.
- **Rationale:** The PHC value already contains the algorithm, version, parameters, salt, and resulting hash needed for verification. Duplicate columns could drift and plaintext never belongs in persistence.

## ADR-029: One PasswordCredential per User

- **Status:** Accepted
- **Decision:** `PasswordCredential.userId` is unique, giving User an optional one-to-one password credential relationship.
- **Rationale:** B1.2 defines one password authentication mechanism per human identity and prevents ambiguous duplicate password credentials.

## ADR-030: Credential material cascades on User deletion

- **Status:** Accepted
- **Decision:** The PasswordCredential foreign key uses `ON DELETE CASCADE` when a User is legitimately physically deleted.
- **Rationale:** Dependent credential material must not survive as an orphan. This explicit exception does not override the B1.1 MerchantMembership restriction that can block User deletion.

## ADR-031: Password cryptography belongs to @tteeka/security

- **Status:** Accepted
- **Decision:** `@tteeka/security` owns password hashing, verification, and rehash detection independently of Prisma, the database package, NestJS, and applications.
- **Rationale:** Cryptographic policy needs one reusable, testable boundary without creating a database dependency or coupling primitives to an HTTP framework.

## ADR-032: Rehash detection precedes login

- **Status:** Accepted
- **Decision:** B1.2 exposes rehash detection without automatically updating stored hashes.
- **Rationale:** A future successful login can upgrade older hashes deliberately and transactionally. No login flow exists in this checkpoint.

## ADR-033: No password pepper in B1.2

- **Status:** Accepted
- **Decision:** Tteeka introduces no password pepper until secret-management and rotation operations are designed.
- **Rationale:** A pepper without controlled storage, access, rotation, and incident procedures can create operational risk. It may be evaluated later as defense-in-depth.

## ADR-034: Roles are merchant-scoped

- **Status:** Accepted
- **Decision:** Every Role belongs to exactly one Merchant.
- **Rationale:** Role meaning and assignment are merchant-specific; a global Role would leak authorization configuration across tenant boundaries.

## ADR-035: Permissions are global stable capabilities

- **Status:** Accepted
- **Decision:** Permission defines a globally unique, stable capability key and does not belong to a Merchant.
- **Rationale:** A shared capability vocabulary avoids duplicating the same semantic action per tenant while Roles provide merchant-specific grouping.

## ADR-036: Memberships receive Roles through MembershipRole

- **Status:** Accepted
- **Decision:** Role assignment uses the explicit MembershipRole entity.
- **Rationale:** An explicit UUIDv7 and timestamped link provides deterministic physical naming, constraints, tenant ownership, and room for later audit metadata.

## ADR-037: Roles receive Permissions through RolePermission

- **Status:** Accepted
- **Decision:** Permission assignment uses the explicit RolePermission entity.
- **Rationale:** An explicit link preserves physical control and tenant context instead of hiding authorization configuration in an implicit ORM join table.

## ADR-038: Memberships may receive multiple Roles

- **Status:** Accepted
- **Decision:** MerchantMembership has no single `roleId`; MembershipRole provides a many-to-many relationship.
- **Rationale:** Staff responsibilities can combine multiple independently managed Roles, and a single field would impose an artificial limit.

## ADR-039: Authorization links carry tenant identity

- **Status:** Accepted
- **Decision:** MembershipRole and RolePermission include `merchantId` where it is needed for ownership and tenant-safe references.
- **Rationale:** Carrying merchant identity makes the assignment's tenant explicit and enables PostgreSQL to enforce it as part of composite keys.

## ADR-040: Composite foreign keys enforce authorization tenancy

- **Status:** Accepted
- **Decision:** Cross-merchant Role assignment is prevented with composite database foreign keys, not solely application checks.
- **Rationale:** PostgreSQL must reject mismatched Merchant, Membership, and Role identifiers even if future application code issues an invalid direct write.

## ADR-041: Role names are unique per Merchant

- **Status:** Accepted
- **Decision:** Each `(merchantId, name)` Role pair is unique, while different Merchants may use the same name.
- **Rationale:** Role names are merchant-local business labels rather than a global capability vocabulary.

## ADR-042: Permission keys are globally unique

- **Status:** Accepted
- **Decision:** Permission keys have one global uniqueness constraint.
- **Rationale:** A stable key must identify one capability consistently across every Merchant and Role.

## ADR-043: Permission lifecycle uses ACTIVE and DEPRECATED

- **Status:** Accepted
- **Decision:** Permissions use `ACTIVE` and `DEPRECATED`, defaulting to `ACTIVE`.
- **Rationale:** Deprecated keys may remain historically addressable while later configuration stops adopting them.

## ADR-044: Role lifecycle uses ACTIVE and DISABLED

- **Status:** Accepted
- **Decision:** Roles use `ACTIVE` and `DISABLED`, defaulting to `ACTIVE`.
- **Rationale:** Lifecycle state is separate from Role identity; owner, system, or built-in categories do not belong in the status enum.

## ADR-045: Authorization is not stored on User

- **Status:** Accepted
- **Decision:** User has no direct Role, Permission, or authorization field.
- **Rationale:** User is global, while authorization is derived in Merchant context through MerchantMembership.

## ADR-046: No owner or administrator boolean

- **Status:** Accepted
- **Decision:** User and MerchantMembership do not gain `isOwner`, `isAdmin`, or equivalent authorization booleans.
- **Rationale:** Authorization concepts belong in the Role and Permission model rather than accumulating rigid special-case flags.

## ADR-047: Default authorization bootstrap is deferred

- **Status:** Accepted
- **Decision:** B1.3 seeds no default Roles and no Permission catalog.
- **Rationale:** Bootstrap policy, stable catalog contents, and evolution require a separately reviewed checkpoint; this checkpoint establishes persistence only.

## ADR-048: Dependent authorization links may cascade

- **Status:** Accepted
- **Decision:** MembershipRole cascades when its owning Membership or Role is physically removed, and RolePermission cascades when its owning Role is removed.
- **Rationale:** Assignment rows are dependent configuration and must not survive without the relationship they describe; lifecycle statuses remain the normal management path.

## ADR-049: Referenced Permission deletion is restricted

- **Status:** Accepted
- **Decision:** A Permission referenced by RolePermission cannot be physically deleted.
- **Rationale:** Silent deletion would change authorization semantics; deprecation preserves both the capability identity and existing assignments.
