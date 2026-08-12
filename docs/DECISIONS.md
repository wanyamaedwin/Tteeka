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

## ADR-050: Opaque server-side sessions

- **Status:** Accepted
- **Decision:** Tteeka uses opaque server-side Sessions rather than JWT as the initial staff web-session model.
- **Rationale:** A meaningless client secret and authoritative server record allow explicit expiry and revocation without embedding identity or authorization claims in client-controlled state.

## ADR-051: Sessions authenticate global User identity

- **Status:** Accepted
- **Decision:** Session belongs to User and does not encode Merchant authorization context.
- **Rationale:** One User may operate in multiple Merchants; authorization remains derived through MerchantMembership, Role, and Permission relationships.

## ADR-052: Session secrets contain 256 random bits

- **Status:** Accepted
- **Decision:** Node's cryptographic random source generates every Session secret from 32 random bytes.
- **Rationale:** Machine-generated 256-bit secrets provide sufficient unpredictability without using UUIDs, timestamps, counters, or identity data as authentication secrets.

## ADR-053: Session tokens are pure unpadded base64url

- **Status:** Accepted
- **Decision:** Raw Session tokens are opaque base64url values containing no prefix or business data.
- **Rationale:** URL-safe encoding transports random bytes without turning the secret into a descriptive or decodable application payload.

## ADR-054: Only SHA-256 Session token hashes are persisted

- **Status:** Accepted
- **Decision:** PostgreSQL stores the lowercase hexadecimal SHA-256 digest and never the raw Session token.
- **Rationale:** Database disclosure should not directly expose the bearer secret, while future requests can hash incoming tokens for indexed lookup.

## ADR-055: Session token hashing is deterministic and unsalted

- **Status:** Accepted
- **Decision:** Session tokens use deterministic unsalted SHA-256 rather than Argon2, bcrypt, a salt column, or a B1.4 pepper.
- **Rationale:** Session secrets have 256 bits of machine-generated entropy, unlike human passwords, and deterministic hashing is required for efficient lookup by digest.

## ADR-056: Session token hashes are globally unique

- **Status:** Accepted
- **Decision:** `sessions.token_hash` has a globally unique database constraint.
- **Rationale:** One digest must resolve to at most one Session, and the unique index is the future authentication lookup path.

## ADR-057: PostgreSQL is Session authority

- **Status:** Accepted
- **Decision:** PostgreSQL is authoritative for Session existence and lifecycle; Redis is not Session authority in B1.4.
- **Rationale:** Durable expiry and revocation facts retain a single source of truth before any caching policy is designed.

## ADR-058: Explicit Session lifecycle facts

- **Status:** Accepted
- **Decision:** Required `expiresAt` and nullable `revokedAt` represent Session lifecycle instead of a `SessionStatus` enum.
- **Rationale:** Active, expired, and revoked state can be derived without redundant state that could disagree with timestamps.

## ADR-059: Session history is retained

- **Status:** Accepted
- **Decision:** Expired and revoked Sessions remain until a future explicit retention policy removes them.
- **Rationale:** Immediate deletion would discard useful security/session history before privacy, operations, and audit retention requirements are designed.

## ADR-060: Sessions cascade on legitimate User deletion

- **Status:** Accepted
- **Decision:** Session to User uses `ON DELETE CASCADE` and `ON UPDATE CASCADE`.
- **Rationale:** Sessions are dependent security material and must not become orphaned; MerchantMembership continues to restrict deletion of referenced Users.

## ADR-061: User-Agent and IP are optional metadata

- **Status:** Accepted
- **Decision:** User-Agent and IP address are optional minimized diagnostic metadata and never authentication factors.
- **Rationale:** The values may support future security/session management but must not create device fingerprinting, IP pinning, or unnecessary privacy exposure.

## ADR-062: Session lifetime policy is deferred

- **Status:** Accepted
- **Decision:** B1.4 gives `expiresAt` no database default and defines no Session TTL, renewal, or sliding-expiry policy.
- **Rationale:** A future issuance checkpoint must deliberately select and review lifetime policy rather than hiding it in persistence defaults.

## ADR-063: Initial staff login uses phone and password

- **Status:** Accepted
- **Decision:** B1.5 authenticates only with normalized phone and password.
- **Rationale:** Phone is the required canonical staff identity established by B1.1; email and other mechanisms require separate review.

## ADR-064: Login normalizes Uganda phone input

- **Status:** Accepted
- **Decision:** Common Uganda phone representations are normalized to canonical `+256` E.164 before User lookup.
- **Rationale:** One canonical lookup prevents presentation formatting from creating inconsistent identity behavior without adding a network dependency.

## ADR-065: Credential failures are publicly generic

- **Status:** Accepted
- **Decision:** Unknown phone, wrong password, missing credential, and DISABLED User return the same HTTP 401 message and shape.
- **Rationale:** Distinguishing these cases would enable account and credential-state enumeration.

## ADR-066: Missing credentials use dummy Argon2 verification

- **Status:** Accepted
- **Decision:** Unknown and missing-credential paths verify against one reusable in-memory synthetic Argon2 hash.
- **Rationale:** Performing comparable expensive work reduces an obvious timing discrepancy without claiming exact timing equality.

## ADR-067: Only ACTIVE Users receive new Sessions

- **Status:** Accepted
- **Decision:** Password verification alone is insufficient when `User.status` is DISABLED.
- **Rationale:** Global identity lifecycle must prevent new authentication material while preserving the generic failure contract.

## ADR-068: MerchantMembership is not required for login

- **Status:** Accepted
- **Decision:** An ACTIVE User may authenticate with zero MerchantMemberships.
- **Rationale:** Login authenticates global User identity; Merchant Membership, Role, and Permission belong to later authorization context.

## ADR-069: Every login creates a fresh opaque Session

- **Status:** Accepted
- **Decision:** Successful login never accepts or reuses a client Session identifier and does not revoke older Sessions.
- **Rationale:** Fresh cryptographic tokens prevent Session fixation while allowing intentional concurrent Sessions.

## ADR-070: Initial Session lifetime is configurable and defaults to 12 hours

- **Status:** Accepted
- **Decision:** `SESSION_TTL_SECONDS` ranges from 300 through 2,592,000 seconds and defaults to 43,200.
- **Rationale:** One reviewed staff-web policy provides a secure initial lifetime while remaining deployment configurable.

## ADR-071: Raw Session tokens use HttpOnly cookie transport

- **Status:** Accepted
- **Decision:** Login delivers the raw token only through `tteeka_session` with HttpOnly enabled.
- **Rationale:** JavaScript should not need direct access to the bearer secret and PostgreSQL must continue storing only its hash.

## ADR-072: Login JSON never contains Session secrets

- **Status:** Accepted
- **Decision:** Successful JSON returns only safe User identity and Session expiry data.
- **Rationale:** Token or hash duplication into response bodies increases accidental exposure without serving a current client need.

## ADR-073: Session cookie uses SameSite Lax

- **Status:** Accepted
- **Decision:** `tteeka_session` uses `SameSite=Lax` and path `/api/v1`.
- **Rationale:** Lax supplies a useful initial cross-site request boundary while the path covers current and future versioned API requests.

## ADR-074: Secure cookie behavior derives from NODE_ENV

- **Status:** Accepted
- **Decision:** Secure is false only in development/test and mandatory in staging/production.
- **Rationale:** Local HTTP remains usable without introducing a production override that could weaken cookie transport.

## ADR-075: Session cookie sets no Domain

- **Status:** Accepted
- **Decision:** Login does not explicitly set a cookie Domain.
- **Rationale:** Host-only scope is narrower and avoids granting the bearer cookie to sibling subdomains.

## ADR-076: Successful login may upgrade Argon2 parameters

- **Status:** Accepted
- **Decision:** After correct password verification, outdated hashes are replaced using current `@tteeka/security` parameters.
- **Rationale:** Normal successful use provides a safe opportunity to migrate stored password protection incrementally.

## ADR-077: Parameter rehash preserves passwordChangedAt

- **Status:** Accepted
- **Decision:** An algorithm/parameter-only rehash updates `passwordHash` but not `passwordChangedAt`.
- **Rationale:** The User's password did not change, so changing the semantic timestamp would record a false security event.

## ADR-078: Login returns no authorization context

- **Status:** Accepted
- **Decision:** Login neither selects nor returns Merchant, Membership, Role, or Permission information.
- **Rationale:** Authentication and tenant authorization remain separate, and no authenticated request context exists yet.

## ADR-079: Rate limiting is deferred but required for hardening

- **Status:** Accepted
- **Decision:** B1.5 does not implement rate limiting, brute-force controls, or account lockout.
- **Rationale:** These controls require separately reviewed policy and infrastructure, but production hardening is incomplete without them.

## ADR-080: Opaque cookies resolve against PostgreSQL Session state

- **Status:** Accepted
- **Decision:** Authenticated HTTP requests resolve `tteeka_session` against PostgreSQL Session state.
- **Rationale:** The cookie is only a bearer secret; durable server-side lifecycle facts remain authoritative.

## ADR-081: Validate raw token structure before lookup

- **Status:** Accepted
- **Decision:** Incoming values must match the 43-character, unpadded base64url, 32-byte B1.4 format before hashing or persistence access.
- **Rationale:** Early bounded validation rejects malformed attacker input without unnecessary database work.

## ADR-082: Session token hashing remains in @tteeka/security

- **Status:** Accepted
- **Decision:** API authentication uses `hashSessionToken()` and does not implement SHA-256 independently.
- **Rationale:** One cryptographic boundary prevents algorithm drift between issuance and resolution.

## ADR-083: Session and User lifecycle jointly determine validity

- **Status:** Accepted
- **Decision:** A usable Session must exist, be unrevoked, expire strictly after server time, and belong to an ACTIVE User.
- **Rationale:** Authentication must honor both Session lifecycle and global identity lifecycle.

## ADR-084: Authentication failures are publicly generic

- **Status:** Accepted
- **Decision:** Missing, malformed, unknown, revoked, expired, and DISABLED-User cases return the same HTTP 401 `Unauthorized.` response.
- **Rationale:** Public distinctions would disclose internal Session or account state.

## ADR-085: Infrastructure failures are not authentication failures

- **Status:** Accepted
- **Decision:** Unexpected Session-lookup failures propagate through 500-class handling instead of becoming 401.
- **Rationale:** An unavailable authority cannot truthfully determine that credentials are invalid.

## ADR-086: Request context uses a safe explicit principal

- **Status:** Accepted
- **Decision:** Successful resolution attaches only safe User identity and minimal Session context to `request.auth`.
- **Rationale:** Controllers should not receive persistence entities, bearer secrets, contact details, or authorization graphs.

## ADR-087: Authentication excludes authorization relationships

- **Status:** Accepted
- **Decision:** Session authentication does not resolve MerchantMembership, Merchant, Role, or Permission.
- **Rationale:** Global User authentication and merchant-scoped authorization are distinct decisions.

## ADR-088: SessionAuthGuard is route-scoped in B1.6

- **Status:** Accepted
- **Decision:** Only explicitly protected routes, initially `/api/v1/auth/me`, use `SessionAuthGuard`; it is not an `APP_GUARD`.
- **Rationale:** Login and health must remain public while the authenticated surface is small.

## ADR-089: Session expiration remains absolute

- **Status:** Accepted
- **Decision:** Authenticated requests never extend `expiresAt`.
- **Rationale:** Request activity must not silently create sliding expiration.

## ADR-090: Authenticated requests do not rotate tokens

- **Status:** Accepted
- **Decision:** B1.6 request resolution neither generates a token nor emits `Set-Cookie`.
- **Rationale:** Rotation and renewal require separate lifecycle and concurrency policy.

## ADR-091: lastUsedAt writes are interval-bounded

- **Status:** Accepted
- **Decision:** A Session is touched only when its prior `lastUsedAt` is at least one configured interval old, using a conditional update.
- **Rationale:** This records useful activity while limiting repeated and concurrent writes.

## ADR-092: The initial touch interval defaults to five minutes

- **Status:** Accepted
- **Decision:** `SESSION_TOUCH_INTERVAL_SECONDS` defaults to 300 and accepts integers from 60 through 3600.
- **Rationale:** Five minutes balances operational recency against write amplification while remaining configurable.

## ADR-093: lastUsedAt is secondary operational metadata

- **Status:** Accepted
- **Decision:** Session validity comes from the authoritative lookup; a subsequent touch failure is logged generically and does not invalidate the principal.
- **Rationale:** Metadata-write availability should not misrepresent a valid Session as unauthorized.

## ADR-094: Cookie parsing is standard and unsigned

- **Status:** Accepted
- **Decision:** The Express adapter uses `cookie-parser` without a signing secret.
- **Rationale:** Standard parsing avoids ad-hoc header logic, while the opaque token and PostgreSQL state already provide authority.

## ADR-095: CSRF protection is deferred but required

- **Status:** Accepted
- **Decision:** B1.6 introduces no CSRF mechanism, and one must be designed before production authenticated state-changing browser endpoints.
- **Rationale:** `/me` is read-only, but cookie-authenticated write APIs require an explicit reviewed cross-site request policy.

## ADR-096: Logout revokes rather than deletes Sessions

- **Status:** Accepted
- **Decision:** Logout operations set `revokedAt` and retain Session rows.
- **Rationale:** Revocation immediately invalidates credentials while preserving security history for a future retention policy.

## ADR-097: The first revocation timestamp is authoritative

- **Status:** Accepted
- **Decision:** Revocation updates only Sessions whose `revokedAt` is null.
- **Rationale:** Repeated commands must not overwrite the original lifecycle fact.

## ADR-098: Current logout is unguarded and idempotent

- **Status:** Accepted
- **Decision:** `POST /auth/logout` does not use `SessionAuthGuard` and returns 204 after safe missing, malformed, stale, expired, revoked, unknown, or DISABLED-User cookie handling.
- **Rationale:** A client must always be able to discard unusable local credentials without learning server-side Session state.

## ADR-099: Invalid logout cookie structure avoids PostgreSQL

- **Status:** Accepted
- **Decision:** Missing and malformed current-logout cookies trigger neither hashing nor persistence access.
- **Rationale:** No server-side Session can be identified from invalid input, so database work is unnecessary.

## ADR-100: Valid logout tokens are hashed before persistence

- **Status:** Accepted
- **Decision:** Current logout passes only `hashSessionToken(rawToken)` to the Auth store.
- **Rationale:** Raw bearer secrets must never cross the persistence boundary.

## ADR-101: Zero-row current revocation is successful

- **Status:** Accepted
- **Decision:** Unknown and already-revoked valid token hashes still produce HTTP 204.
- **Rationale:** Idempotence avoids Session-existence and lifecycle disclosure.

## ADR-102: Revocation infrastructure failures propagate

- **Status:** Accepted
- **Decision:** Failure to perform required persistence work follows 500-class handling rather than returning 204 or 401.
- **Rationale:** The server cannot truthfully confirm logout when durable revocation is unconfirmed.

## ADR-103: Cookie clearing follows confirmed server work

- **Status:** Accepted
- **Decision:** A logout cookie is cleared only after any required revocation succeeds.
- **Rationale:** Retaining the browser credential on failure allows a meaningful retry.

## ADR-104: Logout-all requires authenticated Session context

- **Status:** Accepted
- **Decision:** `POST /auth/logout-all` uses the route-scoped `SessionAuthGuard`.
- **Rationale:** Bulk revocation must establish which User owns the target Sessions.

## ADR-105: Logout-all trusts only AuthenticatedPrincipal identity

- **Status:** Accepted
- **Decision:** The User ID comes only from `request.auth`, never client request data.
- **Rationale:** A caller must not choose another User's revocation scope.

## ADR-106: Logout-all revokes every unrevoked User Session

- **Status:** Accepted
- **Decision:** One bulk update includes the current Session, other Sessions, and expired-but-unrevoked rows for the global User.
- **Rationale:** Logout-all expresses intent to invalidate every remaining bearer credential, regardless of expiry.

## ADR-107: Logout-all preserves earlier revocations

- **Status:** Accepted
- **Decision:** Already-revoked Sessions are excluded from the bulk update.
- **Rationale:** Their original `revokedAt` remains authoritative.

## ADR-108: Logout-all isolates other Users

- **Status:** Accepted
- **Decision:** Bulk revocation filters by the authenticated global User ID.
- **Rationale:** Session ownership, not tenant membership, defines the revocation boundary.

## ADR-109: Logout responses expose no Session count

- **Status:** Accepted
- **Decision:** Successful logout endpoints return 204 with no body or affected-row count.
- **Rationale:** Clients need only completion, and counts unnecessarily disclose internal state.

## ADR-110: Logout issues no replacement Session

- **Status:** Accepted
- **Decision:** Logout neither generates nor rotates tokens and never creates a replacement Session.
- **Rationale:** Revocation must terminate credentials rather than silently renew them.

## ADR-111: Logout is independent of merchant authorization

- **Status:** Accepted
- **Decision:** Neither logout operation resolves Merchant, Membership, Role, or Permission data.
- **Rationale:** Session lifecycle belongs to global User authentication, not tenant authorization.

## ADR-112: Session cleanup remains deferred

- **Status:** Accepted
- **Decision:** B1.7 introduces no deletion or automatic retention process for revoked or expired Sessions.
- **Rationale:** Retention requires separate privacy, audit, and operational policy.

## ADR-113: Logout uses POST while broader CSRF work remains deferred

- **Status:** Accepted
- **Decision:** Both logout commands use POST and B1.7 adds no full CSRF framework.
- **Rationale:** State changes must not use GET, while production business-write CSRF hardening requires separate review.

## ADR-114: Merchant context uses an explicit URL

- **Status:** Accepted
- **Decision:** Merchant context is requested at `GET /api/v1/merchants/:merchantId/context` with the Merchant identifier in the path.
- **Rationale:** Tenant selection must be visible, auditable, and independent of implicit or sticky client state.

## ADR-115: Session does not store Merchant context

- **Status:** Accepted
- **Decision:** Session persistence and `AuthenticatedPrincipal` contain no Merchant, Membership, Role, or Permission state.
- **Rationale:** A global User may work across multiple Merchants, and authorization must not become stale authentication state.

## ADR-116: Authentication and authorization guards remain separate

- **Status:** Accepted
- **Decision:** The context route composes `SessionAuthGuard` before `MerchantContextGuard` rather than combining their responsibilities.
- **Rationale:** Global identity and tenant-scoped access are distinct trust decisions with different inputs and failures.

## ADR-117: Only ACTIVE Merchants expose context

- **Status:** Accepted
- **Decision:** SUSPENDED and ARCHIVED Merchants cannot produce Merchant context.
- **Rationale:** Merchant lifecycle is an authoritative tenant-wide availability boundary.

## ADR-118: Only ACTIVE Memberships expose context

- **Status:** Accepted
- **Decision:** A missing or DISABLED MerchantMembership cannot produce Merchant context.
- **Rationale:** Membership lifecycle directly controls the User's current access to that Merchant.

## ADR-119: Zero-Role Memberships are valid

- **Status:** Accepted
- **Decision:** An ACTIVE Membership may resolve successful context with no Roles and no Permissions.
- **Rationale:** Membership existence and granted capability are separate facts, including during onboarding or deliberate least privilege.

## ADR-120: Only ACTIVE Roles contribute

- **Status:** Accepted
- **Decision:** Assigned DISABLED Roles remain persisted but are excluded from resolved context.
- **Rationale:** Lifecycle changes must remove the Role's effective authority without destructive assignment edits.

## ADR-121: Only ACTIVE Permissions contribute

- **Status:** Accepted
- **Decision:** DEPRECATED Permissions remain persisted but are excluded from effective Permission keys.
- **Rationale:** Deprecation must disable capability use while preserving historical addressability and assignment integrity.

## ADR-122: Effective Permissions are a Role union

- **Status:** Accepted
- **Decision:** A Membership receives the union of ACTIVE Permission keys contributed by all of its ACTIVE Roles.
- **Rationale:** Multiple Role assignment is additive in the B1.8 role-based model.

## ADR-123: Effective Permission keys are deduplicated

- **Status:** Accepted
- **Decision:** Each exact Permission key appears at most once in resolved context even when multiple Roles contribute it.
- **Rationale:** Consumers need a canonical capability set rather than persistence-path duplication.

## ADR-124: Permission matching is exact and has no wildcard semantics

- **Status:** Accepted
- **Decision:** Permission evaluation is case-sensitive exact string membership; `*` and prefixes have no special meaning.
- **Rationale:** Implicit pattern semantics would broaden authority beyond explicitly assigned stable capability keys.

## ADR-125: Permission evaluation has no deny rules

- **Status:** Accepted
- **Decision:** B1.8 models only the additive set of effective Permission keys and no explicit or precedence-based deny.
- **Rationale:** Deny semantics require a separately reviewed conflict and inheritance model.

## ADR-126: Role names carry no authority

- **Status:** Accepted
- **Decision:** Names such as Owner, Admin, or Manager are display metadata and never bypass Permission evaluation.
- **Rationale:** Merchant-local mutable labels are unsuitable as stable authorization capabilities.

## ADR-127: Merchant authorization denials are generic

- **Status:** Accepted
- **Decision:** Unknown Merchant, missing Membership, non-ACTIVE Membership, and non-ACTIVE Merchant return the same `403 Forbidden.` response.
- **Rationale:** The endpoint must not disclose tenant existence, relationship, or lifecycle state.

## ADR-128: Authentication and Merchant context occupy separate request fields

- **Status:** Accepted
- **Decision:** Global identity is attached at `request.auth` and resolved authorization at `request.merchantContext`.
- **Rationale:** Keeping contexts separate prevents accidental mutation of the authenticated principal and makes trust boundaries explicit.

## ADR-129: PostgreSQL is authoritative for authorization context

- **Status:** Accepted
- **Decision:** Every Merchant-context request resolves current Membership, Merchant, Role, and Permission state from PostgreSQL.
- **Rationale:** Durable lifecycle and assignment records, not derived client or process state, define current authority.

## ADR-130: B1.8 adds no Session or Redis authorization cache

- **Status:** Accepted
- **Decision:** Effective Roles and Permissions are not cached in Session persistence, cookies, Redis, or process memory.
- **Rationale:** Cache invalidation is unnecessary at this checkpoint and cannot delay revocation effects.

## ADR-131: Authorization lifecycle changes apply on the next request

- **Status:** Accepted
- **Decision:** Merchant suspension or archival, Membership or Role disabling, and Permission deprecation affect the next context resolution without Session replacement.
- **Rationale:** Re-querying authoritative lifecycle state gives administrators immediate access-control effect.

## ADR-132: MerchantContextGuard resolves context but enforces no Permission

- **Status:** Accepted
- **Decision:** `MerchantContextGuard` verifies that context is available and attaches it, but does not require a capability key.
- **Rationale:** Context discovery and route-specific Permission policy are different concerns.

## ADR-133: Permission enforcement is deferred beyond B1.8

- **Status:** Accepted
- **Decision:** B1.8 introduces no Permission decorator, Permission guard, or Permission-protected business endpoint.
- **Rationale:** Enforcement metadata, composition rules, and business-route policy require the next reviewed checkpoint.

## ADR-134: Routes declare one Permission with RequirePermission

- **Status:** Accepted
- **Decision:** Future merchant routes declare a required exact capability through `@RequirePermission(permissionKey)`.
- **Rationale:** Declarative metadata keeps authorization policy beside the protected handler without mixing it into business logic.

## ADR-135: Initial route metadata contains exactly one Permission

- **Status:** Accepted
- **Decision:** B1.9 supports one required Permission per class or method and no any/all metadata modes.
- **Rationale:** Single-key policy is sufficient before real commerce routes establish justified composition needs.

## ADR-136: PermissionGuard uses only request Merchant context

- **Status:** Accepted
- **Decision:** PermissionGuard consumes B1.8 `request.merchantContext` and performs no persistence lookup.
- **Rationale:** Membership, Role, and Permission state has already been resolved for the current request.

## ADR-137: Route Permission matching is exact and case-sensitive

- **Status:** Accepted
- **Decision:** Required Permission strings are preserved and matched without normalization or pattern expansion.
- **Rationale:** A guard must enforce the precise stable capability declared by developer code.

## ADR-138: PermissionGuard delegates to PermissionEvaluator

- **Status:** Accepted
- **Decision:** PermissionGuard calls `PermissionEvaluator.hasPermission` rather than duplicating set-membership logic.
- **Rationale:** One evaluator abstraction keeps Permission semantics centralized and independently testable.

## ADR-139: Permission denial is generic

- **Status:** Accepted
- **Decision:** Missing exact grants return HTTP 403 with `Forbidden.` and no required-key or context details.
- **Rationale:** Authorization denials must not disclose internal Roles, Permissions, or tenant relationships.

## ADR-140: Missing Permission metadata fails closed

- **Status:** Accepted
- **Decision:** PermissionGuard without `@RequirePermission` produces a generic 500-class failure.
- **Rationale:** Guard use without policy is server misconfiguration and must never become accidental default allow.

## ADR-141: Missing Merchant context fails as misconfiguration

- **Status:** Accepted
- **Decision:** PermissionGuard without `request.merchantContext` produces a generic 500-class failure.
- **Rationale:** The missing prerequisite indicates incorrect route composition rather than an ordinary denied grant.

## ADR-142: Merchant route guards have a fixed responsibility order

- **Status:** Accepted
- **Decision:** Protected merchant routes order SessionAuthGuard, MerchantContextGuard, then PermissionGuard.
- **Rationale:** Authentication, tenant-context resolution, and exact capability enforcement are separate dependent decisions.

## ADR-143: PermissionGuard remains route-scoped

- **Status:** Accepted
- **Decision:** PermissionGuard is explicitly attached only to routes that declare a required Permission.
- **Rationale:** Tteeka has no substantial production commerce route surface requiring a global policy yet.

## ADR-144: Global secure-by-default authorization remains deferred

- **Status:** Accepted
- **Decision:** B1.9 introduces no `APP_GUARD`, global PermissionGuard, or `@Public` metadata infrastructure.
- **Rationale:** A global policy should be designed against real production route categories rather than hypothetical endpoints.

## ADR-145: Declarative enforcement adds no wildcard or deny semantics

- **Status:** Accepted
- **Decision:** PermissionGuard retains grant-only exact-key behavior with no wildcard, deny, priority, or inheritance rules.
- **Rationale:** Route metadata does not justify broadening the accepted B1.8 Permission model.

## ADR-146: Role names never bypass PermissionGuard

- **Status:** Accepted
- **Decision:** PermissionGuard does not inspect Role names and grants no implicit authority to them.
- **Rationale:** Merchant-local labels are mutable display configuration rather than stable capabilities.

## ADR-147: Owner and Admin have no implicit authority

- **Status:** Accepted
- **Decision:** B1.9 adds no Owner, Admin, superuser, or similar Permission bypass.
- **Rationale:** Every authorized route call must contain the exact declared Permission in resolved context.

## ADR-148: B1.9 adds no production authorization probe

- **Status:** Accepted
- **Decision:** No production endpoint exists solely to demonstrate PermissionGuard.
- **Rationale:** Production routes must represent real product capabilities rather than test scaffolding.

## ADR-149: Test-only controllers prove guard behavior

- **Status:** Accepted
- **Decision:** Real HTTP/PostgreSQL PermissionGuard behavior is tested through a controller registered only in a test module.
- **Rationale:** This validates the complete Nest guard pipeline without expanding the production API surface.

## ADR-150: PostgreSQL remains authority before PermissionGuard

- **Status:** Accepted
- **Decision:** MerchantContextGuard resolves PostgreSQL state afresh before request-local PermissionGuard evaluation.
- **Rationale:** Immediate lifecycle changes remain effective without a second guard query, Session snapshot, or authorization cache.

## ADR-151: Declarative enforcement completes the B1 security foundation

- **Status:** Accepted
- **Decision:** B1.9 completes the B1 authentication and authorization foundation; commerce modules begin afterward.
- **Rationale:** Tteeka now has credential, Session, request identity, revocation, tenant context, and exact route-Permission primitives.

## ADR-152: B2.1 reuses the Merchant identity record

- **Status:** Accepted
- **Decision:** Profile and core settings use the existing typed Merchant columns rather than a generic settings table or blob.
- **Rationale:** Existing ownership is explicit and preserves type safety, validation, and migration discipline.

## ADR-153: Profile and settings use separate APIs

- **Status:** Accepted
- **Decision:** Merchant profile and core operational settings have separate read/update routes even though both persist on Merchant.
- **Rationale:** Separate contracts prevent cross-domain field updates and allow independent Permissions and future evolution.

## ADR-154: Domain policy belongs to its enforcing domain

- **Status:** Accepted
- **Decision:** B2.1 contains only identity/contact fields plus currency and timezone; operational policy is deferred to its owner.
- **Rationale:** A generic Merchant settings surface would separate policy configuration from the domain that validates and enforces it.

## ADR-155: COD policy is deferred to payment/COD

- **Status:** Accepted
- **Decision:** COD eligibility, deposits, limits, failed-delivery costs, and verification rules are not Merchant core settings.
- **Rationale:** They require payment, fulfilment, and risk behavior that B2.1 does not implement.

## ADR-156: Stock-hold policy is deferred to inventory reservation

- **Status:** Accepted
- **Decision:** Stock-hold triggers, expiry, and high-demand policy are excluded from B2.1.
- **Rationale:** Reservation policy belongs with inventory state and concurrency rules.

## ADR-157: Delivery policy is deferred to fulfilment

- **Status:** Accepted
- **Decision:** Delivery fees, zones, service levels, failed-delivery costs, and rider proof rules are excluded from B2.1.
- **Rationale:** These settings require a delivery model and enforcement workflow.

## ADR-158: Return policy is deferred to returns

- **Status:** Accepted
- **Decision:** Return eligibility, windows, and restocking fees are excluded from B2.1.
- **Rationale:** Returns policy belongs with order history, item condition, refund, and inventory behavior.

## ADR-159: B2.1 defines canonical Merchant Permission keys

- **Status:** Accepted
- **Decision:** Merchant profile/settings read and manage keys are centralized as stable application constants.
- **Rationale:** Central constants prevent literal drift between route policy and tests.

## ADR-160: B2.1 does not seed Permissions

- **Status:** Accepted
- **Decision:** Canonical keys are code-defined but are not inserted at startup or through migration SQL, and no Roles are created automatically.
- **Rationale:** Bootstrap and administration policy requires the dedicated B2.2 review.

## ADR-161: Every Merchant business route uses the complete guard pipeline

- **Status:** Accepted
- **Decision:** B2.1 routes explicitly order SessionAuthGuard, MerchantContextGuard, then PermissionGuard.
- **Rationale:** Authentication, current tenant resolution, and exact business capability enforcement remain separate concerns.

## ADR-162: Manage does not imply read

- **Status:** Accepted
- **Decision:** Profile/settings manage Permissions do not automatically grant their corresponding read Permissions.
- **Rationale:** B1 authorization has exact grant-only semantics and no Permission hierarchy.

## ADR-163: Resolved Merchant context is the service tenant authority

- **Status:** Accepted
- **Decision:** Merchant operations use `merchantContext.merchant.id` after authorization rather than trusting another route-derived ID.
- **Rationale:** Carrying the resolved tenant boundary into persistence reduces accidental cross-tenant mismatches.

## ADR-164: Merchant and authentication phones share Uganda normalization

- **Status:** Accepted
- **Decision:** Login and Merchant profile updates use one neutral Uganda E.164 normalizer.
- **Rationale:** A single pure implementation prevents canonicalization drift across identity and business APIs.

## ADR-165: Merchant email is canonical but not unique

- **Status:** Accepted
- **Decision:** Merchant email is trimmed, validated, and lowercased without adding a global uniqueness constraint.
- **Rationale:** Contact reuse is allowed by the accepted data model and B2.1 does not invent a constraint.

## ADR-166: Merchant currency is canonical uppercase ISO-style text

- **Status:** Accepted
- **Decision:** Currency accepts exactly three ASCII letters and persists uppercase in the existing `char(3)` column.
- **Rationale:** This provides stable storage without adding FX conversion or exchange-rate dependencies.

## ADR-167: Merchant timezone uses validated IANA identifiers

- **Status:** Accepted
- **Decision:** Timezone values are length-bounded and validated/canonicalized through Node `Intl`.
- **Rationale:** The runtime already supplies authoritative IANA validation without another dependency.

## ADR-168: Commercial-history currency restrictions are deferred

- **Status:** Accepted
- **Decision:** B2.1 permits currency changes because no Order, Payment, or ledger records exist; future financial domains will define snapshot and restriction rules.
- **Rationale:** Restricting changes without commercial history would encode a premature invariant.

## ADR-169: Merchant changes are not yet audit logged

- **Status:** Accepted
- **Decision:** B2.1 introduces no fake audit log or outbox; mutable Merchant changes will integrate with the planned B14 foundation.
- **Rationale:** Durable audit semantics require the shared transactional audit/outbox architecture.

## ADR-170: Access administration is separate from runtime authorization

- **Status:** Accepted
- **Decision:** `AccessManagementModule` administers authorization records while `AuthorizationModule` only resolves and enforces them.
- **Rationale:** Dependency direction stays explicit and avoids circular policy ownership.

## ADR-171: Staff addition targets an existing ACTIVE global User

- **Status:** Accepted
- **Decision:** B2.2 creates only a MerchantMembership for an existing ACTIVE User.
- **Rationale:** Invitations, signup, credentials, and account onboarding require a separate design.

## ADR-172: Staff lookup failure is enumeration safe

- **Status:** Accepted
- **Decision:** Unknown and globally DISABLED User phones return the same generic 422 response.
- **Rationale:** Merchant administrators must not gain a global account-discovery oracle.

## ADR-173: Membership creation assigns no default Role

- **Status:** Accepted
- **Decision:** A new Membership is ACTIVE with zero Role links.
- **Rationale:** Tteeka has no reviewed ownership or default-Role model.

## ADR-174: Membership disablement retains Role assignments

- **Status:** Accepted
- **Decision:** Disabling a Membership preserves MembershipRole rows.
- **Rationale:** Lifecycle state, not destructive graph rewriting, controls participation.

## ADR-175: Membership reactivation restores retained links

- **Status:** Accepted
- **Decision:** Reactivation makes retained active Role grants effective again.
- **Rationale:** The lifecycle transition is reversible and predictable.

## ADR-176: Membership Role assignment is exact replacement

- **Status:** Accepted
- **Decision:** PUT atomically replaces the complete desired MembershipRole set.
- **Rationale:** Exact state is idempotent and avoids ambiguous incremental mutations.

## ADR-177: Only ACTIVE Roles are newly assignable

- **Status:** Accepted
- **Decision:** Missing, foreign, or DISABLED Roles reject the whole replacement.
- **Rationale:** New configuration cannot depend on unavailable authority.

## ADR-178: Roles use reversible lifecycle rather than hard deletion

- **Status:** Accepted
- **Decision:** B2.2 exposes ACTIVE/DISABLED transitions and no Role DELETE route.
- **Rationale:** Configuration identity and historical links remain addressable.

## ADR-179: Role disablement retains all grant links

- **Status:** Accepted
- **Decision:** MembershipRole and RolePermission rows survive Role disablement.
- **Rationale:** Reactivation restores configuration without reconstruction.

## ADR-180: Role Permission assignment is exact replacement

- **Status:** Accepted
- **Decision:** PUT atomically replaces a Role's complete Permission set.
- **Rationale:** Transactional desired-state semantics prevent partial grants.

## ADR-181: Only ACTIVE application-catalog Permissions are assignable

- **Status:** Accepted
- **Decision:** New grants require a code-owned key and an ACTIVE matching database record.
- **Rationale:** Arbitrary or deliberately unavailable authority cannot enter Role configuration.

## ADR-182: DEPRECATED Permissions retain historical links

- **Status:** Accepted
- **Decision:** Deprecation makes grants ineffective and unassignable without deleting RolePermission history.
- **Rationale:** Lifecycle changes remain observable and reversible.

## ADR-183: The application Permission catalog is code owned

- **Status:** Accepted
- **Decision:** B2.2 composes eight implemented keys and descriptions from canonical constants.
- **Rationale:** Deployable capabilities, not arbitrary API input, define assignable authority.

## ADR-184: Permission synchronization is explicit and idempotent

- **Status:** Accepted
- **Decision:** `npm run permissions:sync` is operational and never an API startup side effect.
- **Rationale:** Database mutation remains deliberate, observable, and repeatable.

## ADR-185: Sync creates missing catalog Permissions as ACTIVE

- **Status:** Accepted
- **Decision:** Missing catalog records are created with canonical descriptions and ACTIVE status.
- **Rationale:** Deployment can deterministically materialize implemented capabilities.

## ADR-186: Sync never reactivates DEPRECATED Permissions

- **Status:** Accepted
- **Decision:** Existing DEPRECATED lifecycle state is preserved.
- **Rationale:** Deployment must not reverse a deliberate security decision.

## ADR-187: Sync leaves unknown database Permissions untouched

- **Status:** Accepted
- **Decision:** Unknown records are not deleted, renamed, or deprecated automatically.
- **Rationale:** Conservative synchronization avoids destructive assumptions.

## ADR-188: Permission sync creates no default Roles

- **Status:** Accepted
- **Decision:** Synchronization mutates Permission catalog records only.
- **Rationale:** Merchant-local Role design remains explicit administration.

## ADR-189: Role assignment requires merchant.roles.manage

- **Status:** Accepted
- **Decision:** Replacing Membership Roles requires Role-management rather than staff-management authority.
- **Rationale:** Role assignment changes effective authorization configuration.

## ADR-190: Manage does not imply read

- **Status:** Accepted
- **Decision:** Staff and Role manage Permissions do not imply corresponding read Permissions.
- **Rationale:** B1.9 exact-grant semantics remain authoritative.

## ADR-191: Authorization changes do not revoke Sessions

- **Status:** Accepted
- **Decision:** Membership, Role, and grant mutations leave the global Session intact.
- **Rationale:** Fresh PostgreSQL context applies changes without conflating authentication and authorization.

## ADR-192: PostgreSQL remains current authorization authority

- **Status:** Accepted
- **Decision:** B2.2 adds no Redis, Session, or process authorization snapshot.
- **Rationale:** Each request observes current persisted lifecycle and link state.

## ADR-193: No ownership, Role-name, or self-protection semantics exist

- **Status:** Accepted
- **Decision:** A capable caller may mutate any tenant-scoped Membership, including their own, with no Owner/Admin/last-admin bypass or block.
- **Rationale:** Such continuity rules require an explicit ownership model.

## ADR-194: Access-management changes are not yet audit logged

- **Status:** Accepted
- **Decision:** B2.2 introduces no partial AuditLog or outbox implementation.
- **Rationale:** Immutable authorization history belongs to the planned shared audit/outbox stage.

## ADR-195: Product is the first core commerce aggregate

- **Status:** Accepted
- **Decision:** B3.1 introduces Product before variants, inventory, orders, or payments.
- **Rationale:** Stable merchant catalogue identity is the prerequisite for later sellable and transactional concepts.

## ADR-196: Product belongs directly to one Merchant

- **Status:** Accepted
- **Decision:** Every Product carries an explicit Merchant foreign key with restrictive deletion.
- **Rationale:** Tenant ownership must be database-visible and enforceable.

## ADR-197: Product identifiers use UUIDv7

- **Status:** Accepted
- **Decision:** Products use the existing database-generated UUIDv7 convention.
- **Rationale:** Product identity remains consistent with current internal aggregates.

## ADR-198: Product lifecycle has three states

- **Status:** Accepted
- **Decision:** Product status is ACTIVE, INACTIVE, or ARCHIVED.
- **Rationale:** Operations need temporary inactivity and retained retirement without deletion.

## ADR-199: B3.1 Product status transitions are reversible

- **Status:** Accepted
- **Decision:** Any Product state may transition to any other state.
- **Rationale:** No immutable downstream commerce history constrains restoration yet.

## ADR-200: Products are retained instead of hard-deleted

- **Status:** Accepted
- **Decision:** B3.1 exposes lifecycle changes and no Product DELETE operation.
- **Rationale:** Stable identity should survive operational retirement.

## ADR-201: Product names are not unique within a Merchant

- **Status:** Accepted
- **Decision:** Duplicate Product names are permitted.
- **Rationale:** Future variants/SKUs, not display names, distinguish sellable items.

## ADR-202: SKU belongs to ProductVariant

- **Status:** Accepted
- **Decision:** SKU and barcode are deferred to B3.2 ProductVariant.
- **Rationale:** A Product is catalogue identity, not yet a sellable variant.

## ADR-203: Category and brand are bounded nullable strings

- **Status:** Accepted
- **Decision:** B3.1 stores category and brand as case-preserving metadata.
- **Rationale:** Basic filtering is useful before taxonomy aggregates are justified.

## ADR-204: Category and Brand aggregates are deferred

- **Status:** Accepted
- **Decision:** B3.1 creates no Category or Brand table/CRUD.
- **Rationale:** Requirements have not earned taxonomy identity or hierarchy.

## ADR-205: Product JSON metadata is rejected

- **Status:** Accepted
- **Decision:** Product has no generic metadata, attributes, or options JSON.
- **Rationale:** B3.2 will model variant attributes explicitly rather than creating an untyped escape hatch.

## ADR-206: Product administration is merchant-context scoped

- **Status:** Accepted
- **Decision:** Product APIs use merchant-scoped URLs and resolved context as tenant authority.
- **Rationale:** Persistence cannot be redirected by untrusted route/body tenant fields.

## ADR-207: Missing and foreign Product targets share generic 404

- **Status:** Accepted
- **Decision:** Product lookups combine Merchant and Product IDs and expose one not-found response.
- **Rationale:** Cross-tenant existence must not leak.

## ADR-208: catalogue.read protects Product reads

- **Status:** Accepted
- **Decision:** Product list and detail require `catalogue.read`.
- **Rationale:** Catalogue visibility is an explicit merchant capability.

## ADR-209: catalogue.manage protects Product writes

- **Status:** Accepted
- **Decision:** Product create, metadata update, and lifecycle update require `catalogue.manage`.
- **Rationale:** Catalogue mutation is distinct from viewing.

## ADR-210: Catalogue manage does not imply read

- **Status:** Accepted
- **Decision:** `catalogue.manage` grants no implicit `catalogue.read` capability.
- **Rationale:** Existing exact Permission semantics remain authoritative.

## ADR-211: Product list starts with offset pagination

- **Status:** Accepted
- **Decision:** B3.1 uses page/pageSize offset pagination.
- **Rationale:** Initial merchant catalogues are modest and transparent pagination is sufficient.

## ADR-212: Product list ordering is deterministic

- **Status:** Accepted
- **Decision:** Lists sort by Product name then Product UUID.
- **Rationale:** Stable page boundaries cannot rely on insertion order.

## ADR-213: Basic Product search uses PostgreSQL matching

- **Status:** Accepted
- **Decision:** Search uses Prisma case-insensitive containment across four bounded fields.
- **Rationale:** A dedicated search engine or extension is premature.

## ADR-214: Product data is not cached in Redis

- **Status:** Accepted
- **Decision:** PostgreSQL is read on every B3.1 Product operation.
- **Rationale:** There is no measured need for catalogue cache invalidation complexity.

## ADR-215: Application Permission catalog expands to ten keys

- **Status:** Accepted
- **Decision:** `catalogue.read` and `catalogue.manage` join the existing eight canonical keys.
- **Rationale:** Assignable authority must track implemented production capability.

## ADR-216: Permission synchronization remains explicit

- **Status:** Accepted
- **Decision:** Sync materializes all ten keys without startup side effects or Role creation.
- **Rationale:** Operational security mutation remains deliberate and idempotent.

## ADR-217: Product operations do not mutate Sessions

- **Status:** Accepted
- **Decision:** Product reads/writes do not rotate, renew, or revoke global Sessions.
- **Rationale:** Authentication and current merchant authorization remain separate boundaries.

## ADR-218: Product changes are not yet audit logged

- **Status:** Accepted
- **Decision:** B3.1 adds no partial audit/outbox implementation.
- **Rationale:** Durable business history belongs to the planned shared transactional foundation.

## ADR-219: ProductVariant is the exact future sellable identity

- **Status:** Accepted
- **Decision:** Product remains descriptive while ProductVariant is the SKU-bearing identity later commerce domains reference.
- **Rationale:** Inventory and transactions require one precise sellable identity.

## ADR-220: Variant is tenant-bound through Merchant and Product

- **Status:** Accepted
- **Decision:** A composite `(merchant_id, product_id)` foreign key is authoritative.
- **Rationale:** PostgreSQL must reject cross-Merchant Product/Variant combinations.

## ADR-221: Variant identifiers use UUIDv7

- **Status:** Accepted
- **Decision:** ProductVariant IDs use the repository's database-generated UUIDv7 convention.
- **Rationale:** Catalogue identity remains consistent with existing internal aggregates.

## ADR-222: SKU is unique per Merchant

- **Status:** Accepted
- **Decision:** `(merchant_id, sku)` is unique; the same SKU may exist for another Merchant.
- **Rationale:** SKU is a Merchant's internal sellable identifier, not a global Tteeka namespace.

## ADR-223: SKU is uppercase canonicalized

- **Status:** Accepted
- **Decision:** Valid trimmed SKU input is uppercased before persistence and lookup.
- **Rationale:** Casing variants must resolve to one Merchant SKU identity.

## ADR-224: Barcode is optional and Merchant-unique

- **Status:** Accepted
- **Decision:** A present case-preserving barcode is unique per Merchant; multiple nulls are valid.
- **Rationale:** Retail and internal scanner labels are optional tenant-owned identifiers.

## ADR-225: Size and colour are bounded nullable strings

- **Status:** Accepted
- **Decision:** B3.2 supports explicit nullable size and colour without combination uniqueness.
- **Rationale:** Simple variants need metadata without premature option aggregates.

## ADR-226: Generic Variant attribute JSON is rejected

- **Status:** Accepted
- **Decision:** ProductVariant has no attributes, options, or option-values JSON field.
- **Rationale:** Future option types require deliberate structured design.

## ADR-227: Variants default INACTIVE

- **Status:** Accepted
- **Decision:** New Variants start unpriced and INACTIVE.
- **Rationale:** A future sellable identity is not commercially usable before pricing.

## ADR-228: ACTIVE requires current selling price

- **Status:** Accepted
- **Decision:** Activation requires both selling price and price currency, otherwise HTTP 422.
- **Rationale:** ACTIVE must not imply a sellable Variant with undefined monetary state.

## ADR-229: Product lifecycle does not cascade to Variants

- **Status:** Accepted
- **Decision:** Product status changes never rewrite child Variant status.
- **Rationale:** Each retained aggregate has an independent administrative lifecycle.

## ADR-230: Current money uses PostgreSQL BIGINT

- **Status:** Accepted
- **Decision:** Selling and cost amounts are signed BIGINT integers.
- **Rationale:** Integer money avoids fractional and floating-point ambiguity.

## ADR-231: Money uses JSON decimal strings

- **Status:** Accepted
- **Decision:** APIs accept and return canonical base-10 strings within signed BIGINT bounds.
- **Rationale:** JavaScript number serialization cannot safely represent all valid stored amounts.

## ADR-232: Cost may exceed selling price

- **Status:** Accepted
- **Decision:** Cost is nullable/nonnegative and is not constrained below selling price.
- **Rationale:** Below-cost sales are legitimate business states.

## ADR-233: Price currency is snapshotted

- **Status:** Accepted
- **Decision:** Price writes copy the Merchant's current currency into current state and history.
- **Rationale:** Every stored amount retains explicit monetary meaning.

## ADR-234: Merchant currency changes do not reinterpret old prices

- **Status:** Accepted
- **Decision:** Settings changes do not rewrite Variant amounts or currency snapshots.
- **Rationale:** Existing monetary states remain historically stable.

## ADR-235: FX conversion is absent

- **Status:** Accepted
- **Decision:** Currency changes require explicit repricing and perform no conversion.
- **Rationale:** Automatic FX needs a separate reviewed rates and rounding model.

## ADR-236: Current price is stored on ProductVariant

- **Status:** Accepted
- **Decision:** ProductVariant carries the current selling/cost/currency/update state.
- **Rationale:** Ordinary catalogue reads should not reconstruct current state from history.

## ADR-237: Changed prices append VariantPriceHistory

- **Status:** Accepted
- **Decision:** Every changed selling price, cost, or effective currency adds one immutable snapshot.
- **Rationale:** Prior price states must remain observable.

## ADR-238: Identical price PUT is idempotent

- **Status:** Accepted
- **Decision:** An identical desired state changes neither update time nor history.
- **Rationale:** Repeated network requests must not create false history.

## ADR-239: Price current state and history are transactional

- **Status:** Accepted
- **Decision:** PostgreSQL row locking and one transaction serialize current-state update plus history insert.
- **Rationale:** Concurrency must never leave current price and committed history inconsistent.

## ADR-240: Price history is domain history, not general audit

- **Status:** Accepted
- **Decision:** VariantPriceHistory records monetary states without actor/request metadata.
- **Rationale:** Cross-domain audit and outbox remain a later shared concern.

## ADR-241: Price management has a separate Permission

- **Status:** Accepted
- **Decision:** `catalogue.price.manage` alone protects price PUT and history.
- **Rationale:** Price/cost authority is distinct from catalogue identity management.

## ADR-242: Normal catalogue reads hide cost

- **Status:** Accepted
- **Decision:** List, detail, and exact lookup expose selling price but never cost.
- **Rationale:** Cost is sensitive management information.

## ADR-243: Catalogue Permissions imply nothing

- **Status:** Accepted
- **Decision:** Read, manage, and price-manage remain exact independent grants.
- **Rationale:** B1.9 exact-Permission semantics remain authoritative.

## ADR-244: Exact Variant lookup is Merchant scoped

- **Status:** Accepted
- **Decision:** Lookup accepts exactly one SKU or barcode and searches the resolved Merchant only.
- **Rationale:** Identifier existence must not leak across tenants.

## ADR-245: Inventory quantity does not belong in B3.2 catalogue

- **Status:** Accepted
- **Decision:** ProductVariant contains no stock, availability, held, or reserved fields.
- **Rationale:** B4.1 owns inventory authority and its transactional model.

## ADR-246: PostgreSQL remains catalogue and price authority

- **Status:** Accepted
- **Decision:** All B3.2 reads, uniqueness, tenant keys, and price serialization use PostgreSQL.
- **Rationale:** A single authoritative store provides enforceable consistency.

## ADR-247: Redis catalogue caching remains deferred

- **Status:** Accepted
- **Decision:** B3.2 adds no Product, Variant, lookup, or price cache.
- **Rationale:** There is no measured need or reviewed invalidation design.

## ADR-248: B4.1 owns inventory

- **Status:** Accepted
- **Decision:** B3.2 stops at sellable identity and price; B4.1 begins stock authority.
- **Rationale:** Catalogue and inventory are separate bounded domains.

# B4.1 inventory decisions

1. Inventory is separate from catalogue; ProductVariant contains no mutable stock quantity.
2. InventoryLedgerEntry is append-only history and InventoryBalance is its transactional current projection.
3. B4.1 has only AVAILABLE; later states extend inventory without redesigning catalogue.
4. RECEIPT and ADJUSTMENT_IN enter from an external/null state; ADJUSTMENT_OUT leaves AVAILABLE to external/null.
5. Manual adjustments require explanatory notes.
6. Whole-unit quantities use PostgreSQL BIGINT and decimal-string JSON; AVAILABLE cannot become negative.
7. Ledger append and balance update are atomic under PostgreSQL row locking.
8. Zero-history Variants implicitly have AVAILABLE zero; projection rows are lazy.
9. Inventory remains manageable across Variant lifecycle states and without a price.
10. `inventory.read` and `inventory.manage` are independent, expanding the production catalog from 11 to 13 keys.
11. Movement commands require opaque, case-sensitive, per-Merchant idempotency keys. Identical replay returns the original; a different command conflicts.
12. B4.1 idempotency is domain-local, not the future B14 framework.
13. PostgreSQL remains stock authority; no Redis cache or process lock is used.
14. Inventory history is not a generic audit log/outbox.
15. HELD and StockHold remain deferred to B4.2.

# B4.2 stock-hold decisions

1. Temporary reservations are separate StockHold records; InventoryState remains exactly AVAILABLE.
2. Physical available stays unchanged; effective active holds produce held quantity, and sellable is their difference.
3. Holds never write InventoryBalance or InventoryLedgerEntry.
4. Expiry is effective at `expiresAt`, independent of processor lag.
5. ACTIVE, RELEASED, and EXPIRED are the only persisted hold states; release and expiry are terminal.
6. Hold creation and ADJUSTMENT_OUT lock the same AVAILABLE row and validate reservation invariants under that lock.
7. Hold creation requires Merchant-local opaque idempotency over Variant, canonical quantity, and canonical expiry.
8. Exact replay returns the original; mismatched key reuse conflicts.
9. Expiry updates apply only to effectively active holds, may shorten or extend, and identical updates are no-ops.
10. Release of a due active hold records EXPIRED; repeated terminal release is idempotent.
11. The internal processor uses bounded PostgreSQL `FOR UPDATE SKIP LOCKED` batches; no scheduler or public processor route is added.
12. Inventory reads compute held totals with set-based/aggregate queries and no N+1 loop.
13. Existing exact inventory read/manage grants cover the five routes; the catalog remains 13 keys.
14. PostgreSQL remains reservation authority; no Redis cache or process lock is used.
15. Order ownership, sale consumption, partial release, fulfillment states, audit/outbox, and generic B14 idempotency remain deferred.

# B5 customer and delivery-location decisions

1. Customer is a Merchant-owned operational identity separate from global authentication User and staff Membership.
2. Uganda phone input is normalized through the shared utility; canonical Customer phone is unique per Merchant across lifecycle states.
3. Customer name is nullable; phone is the required identity anchor, without copying phone into name.
4. Customer and DeliveryLocation each use only ACTIVE and ARCHIVED, expose no hard delete, and have independent lifecycles.
5. DeliveryLocation models Uganda-first area, landmark, contact phone, instructions, and optional map URL rather than a generic postal Address.
6. Location contact phone may differ from Customer phone and duplicate-looking locations remain valid.
7. Direct Merchant ownership plus a composite Merchant/Customer foreign key makes location ownership database-enforceable and tenant safe.
8. There is no default location, geocoding, coordinate, delivery zone, fee, rider, or external map integration in B5.
9. `customers.read` and `customers.manage` are exact independent Permissions; synchronization remains explicit and grants remain unchanged.
10. Future Orders will own any immutable customer or delivery snapshots; B5 does not link Customers to StockHolds or introduce Orders/Reservations.

# B6.1 draft-order decisions

1. Order is the central commercial record; Payment, Delivery, Inventory/Holds, and Receipts remain independent future domains.
2. The full lifecycle enum is frozen now, but B6.1 produces only DRAFT, ABANDONED, and CANCELLED and exposes no confirmation transition.
3. Current Customer, DeliveryLocation, Product, Variant, and price references are copied into bounded commercial snapshots that mutable source records never rewrite.
4. Customer/location PATCH and item PUT are DRAFT-only; explicit abandon/cancel commands are terminal and naturally idempotent.
5. Item PUT is an atomic desired-state replacement capped at 100 unique Variants and serialized by a PostgreSQL Order-row lock.
6. Existing lines preserve commercial snapshots on quantity change; a removed and later re-added Variant receives a fresh snapshot.
7. Quantity, unit price, line total, and subtotal use PostgreSQL BIGINT with explicit multiplication and summation overflow checks and decimal-string APIs.
8. Every Order is single-currency from Variant price snapshots; empty Orders have null currency and zero subtotal.
9. Order creation uses Merchant-scoped visible-ASCII idempotency keys plus deterministic request hashes; neither is public API data.
10. `orders.read` and `orders.manage` are exact independent grants and do not require Customer or Catalogue permissions for known references.
11. DRAFT contents deliberately ignore current stock. B6.2 owns confirmation and StockHold coordination.

# B6.2 confirmation decisions

1. Confirmation is an Order command protected only by exact `orders.manage`; no Inventory permission or new key is introduced.
2. One PostgreSQL transaction locks Order first, then AVAILABLE rows in ascending Variant-ID order, validates all capacity, creates every Hold, and commits CONFIRMED metadata.
3. Generic Hold creation and Order confirmation share one transaction-aware allocation primitive and effective-active-Hold definition.
4. Each confirmation Hold has an explicit nullable OrderItem association secured by a composite Merchant foreign key; polymorphic ownership is rejected.
5. Confirmation never reprices, resnapshots, or revalidates current catalogue lifecycle or price.
6. Merchant-scoped confirmation idempotency covers canonical Order ID and expiry; exact replay returns existing state and different logical commands conflict.
7. Physical AVAILABLE and InventoryLedgerEntry never change through Hold creation, release, or expiry.
8. Generic Inventory reads conceal Order linkage, and generic release/expiry update is forbidden for Order-managed Holds.
9. Order reads expose a bounded effective Hold summary under `orders.read` without requiring `inventory.read`.
10. Hold expiry is independent from Order status and triggers no cancellation, reopening, renewal, or re-reservation.
11. CONFIRMED may transition to CANCELLED, releasing active Holds and persisting due Holds as EXPIRED; CONFIRMED may not be abandoned.
12. FULFILLED, COMPLETED, consumption, Payment, Delivery, receipts, scheduler, audit, and outbox remain deferred.

# B7.1 payment decisions

1. PaymentTransaction is independent from Order lifecycle, Inventory, StockHolds, Delivery, and Receipts; Order stores no authoritative payment summary columns.
2. CASH, MTN_MOMO, and AIRTEL_MONEY are the only methods; COD is a later collection mode, not a payment method.
3. Reports are accepted for nonempty DRAFT and CONFIRMED Orders and snapshot the authoritative Order currency under an Order-row lock.
4. All reports begin REPORTED. Verification is an explicit authorized Merchant operation and never follows from a screenshot.
5. Mobile Money payer phone is required and uses shared Uganda normalization; provider references remain optional, opaque, and non-unique.
6. Positive amounts and all summary arithmetic use PostgreSQL BIGINT and decimal-string APIs.
7. Report idempotency is Merchant-local over a canonical request fingerprint; exact replay returns the original and mismatched reuse conflicts.
8. Lifecycle commands lock the PaymentTransaction row, preserve replay timestamps, and prevent verify/reject races from producing hybrid history.
9. Only VERIFIED contributes to the derived Order summary. Empty zero-value Orders remain UNPAID, overpayment is represented rather than rejected, and REFUNDED arithmetic is deferred.
10. `payments.read` and `payments.manage` are exact independent Permissions; neither requires or implies an Orders Permission.
11. Cancellation or abandonment retains payment history and performs no automatic reversal or refund.
12. Provider APIs, webhooks, automatic verification, settlement/reconciliation, refund commands, COD/delivery collection, receipts, workers, audit, and outbox remain outside B7.1.
