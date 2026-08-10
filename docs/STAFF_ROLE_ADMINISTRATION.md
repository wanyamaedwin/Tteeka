# Staff, Membership, and Role Administration

## Purpose and module boundary

B2.2 makes Tteeka's existing PostgreSQL authorization graph administrable. `AccessManagementModule` is separate from `AuthorizationModule`: authorization resolves and enforces current grants, while access management changes MerchantMembership, MembershipRole, Role, and RolePermission configuration. Every route uses `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard`, treats `merchantContext.merchant.id` as tenant authority, and returns `Cache-Control: no-store` plus `Pragma: no-cache`.

## Exact administrative Permissions

- `merchant.staff.read` lists Merchant staff Memberships and assigned Roles.
- `merchant.staff.manage` adds existing Users and changes Membership status.
- `merchant.roles.read` lists Merchant Roles and the assignable Permission catalog.
- `merchant.roles.manage` creates/edits Roles and replaces MembershipRole or RolePermission sets.

Manage does not imply read. Role assignment requires `merchant.roles.manage`, not `merchant.staff.manage`. Role names—including Owner or Admin—have no authorization authority or bypass, and there is no hierarchy, wildcard, deny, or self-protection rule.

## Production routes

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

Target Membership and Role UUIDv7 identifiers are validated structurally before store access. A missing or cross-tenant target has the same generic 404 result.

## Existing-User-only staff addition

`POST staff` accepts only a Uganda phone, normalized by the shared E.164 utility used by login and Merchant profile updates. It creates an ACTIVE MerchantMembership only when that phone belongs to an existing ACTIVE global User. An unknown phone and a globally DISABLED User produce the same generic HTTP 422 response, preventing account enumeration. The operation never creates an account, credential, invitation, partial User, or global User mutation.

An existing ACTIVE or DISABLED Membership returns HTTP 409. The same User may belong to another Merchant. A new Membership has no Roles; B2.2 creates no default Owner, Admin, Manager, or Staff Role.

## Membership lifecycle and Role replacement

Membership status is `ACTIVE` or `DISABLED`. Disabling preserves every MembershipRole link; reactivation restores participation when linked Roles and Permissions are active. A capable caller may disable their own Membership, intentionally removing their next-request Merchant access; UI continuity safeguards are separate future concerns.

`PUT staff/:membershipId/roles` is an atomic exact replacement. Duplicate UUIDv7 Role IDs are deduplicated, an empty array removes every assignment without disabling the Membership, and only ACTIVE Roles from the same Merchant may be newly assigned. Any invalid, disabled, missing, or cross-tenant Role fails the transaction with generic HTTP 422 and retains the prior set.

## Role administration

Role names are trimmed, nonblank, at most 80 characters, case-preserving, and unique according to the existing exact `(merchantId, name)` database constraint. Duplicate creation or renaming returns safe HTTP 409. Optional descriptions are trimmed nonblank strings up to 320 characters or explicit `null`.

Roles use ACTIVE/DISABLED lifecycle rather than hard deletion. Disabling retains MembershipRole and RolePermission links but removes effective grants through context resolution. Reactivating restores retained links. Role lists include both lifecycle states and show ACTIVE or DEPRECATED status for historical Permission grants.

## Permission replacement and catalog

`PUT roles/:roleId/permissions` atomically replaces the complete RolePermission set. Duplicate keys are deduplicated; an empty array removes all grants. After B3.1, a new grant must be one of the ten code-owned catalog keys and have an ACTIVE PostgreSQL Permission record. Unknown application keys are HTTP 400; unavailable or DEPRECATED catalog records are generic HTTP 422. Failed validation rolls back without partial change.

```text
merchant.profile.manage
merchant.profile.read
merchant.roles.manage
merchant.roles.read
merchant.settings.manage
merchant.settings.read
merchant.staff.manage
merchant.staff.read
catalogue.manage
catalogue.read
```

`GET permissions` returns only catalog-defined keys currently ACTIVE in PostgreSQL, sorted by key with code-owned descriptions. Unknown database Permissions are neither exposed nor deleted. DEPRECATED catalog Permissions are not assignable or effective, while existing historical RolePermission links remain stored and visible in Role administration.

B3.1 expands the application catalog from eight to ten production keys without changing synchronization semantics.

## Explicit Permission synchronization

Run `npm run permissions:sync` explicitly during deployment or development. The idempotent command creates missing catalog Permissions as ACTIVE and synchronizes descriptions. It never runs at API startup, never reactivates a DEPRECATED record, never deletes/renames/deprecates unknown records, and creates no Merchant, Membership, Role, MembershipRole, or RolePermission.

## Immediate authorization and Session independence

PostgreSQL is resolved on every merchant request. Membership status, Role assignment, Role status, and Role Permission changes affect the next request without re-login. They do not revoke, rotate, renew, or otherwise mutate the global Session and emit no `Set-Cookie`. Redis and Session snapshots are not authorization authorities.

## Deliberate omissions

B2.2 adds no hard-delete API for Membership, Role, or Permission; Permission CRUD; signup; account onboarding; email/WhatsApp invitation; password setup/reset; User editing/disabling; default Roles; commerce Permission keys; or audit/outbox. Immutable authorization audit integration remains later. Full staff invitation/onboarding is deferred. B3.1 introduces the Product Catalogue next.
