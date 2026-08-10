# Merchant Context

## Purpose and boundary

B1.8 resolves merchant-scoped authorization context for an already authenticated User. It adds one explicit endpoint:

```text
GET /api/v1/merchants/:merchantId/context
```

The route runs `SessionAuthGuard` first and `MerchantContextGuard` second. Authentication establishes the global User at `request.auth`; authorization then resolves the requested Merchant at `request.merchantContext`. Neither guard is global, and merchant context is never stored in or inferred from the Session.

B1.8 exposes context and a pure permission evaluator. B1.9 adds a separate declarative PermissionGuard for future merchant business routes, but it does not protect this context-inspection endpoint, seed authorization data, or add role-management APIs.

## Request contract

The caller supplies its existing `tteeka_session` cookie and an explicit Merchant UUIDv7 in the URL. Structurally malformed IDs are rejected with HTTP 400 before any authorization query. A syntactically valid but unknown Merchant, missing Membership, non-ACTIVE Membership, or non-ACTIVE Merchant all produce the same HTTP 403 response:

```json
{
  "statusCode": 403,
  "message": "Forbidden.",
  "error": "Forbidden"
}
```

The generic response deliberately does not reveal Merchant existence, Membership existence, or lifecycle state. Missing or invalid Session credentials retain the authentication layer's generic HTTP 401 behavior.

## Resolution and lifecycle rules

PostgreSQL is authoritative on every request. The authorization store performs one focused Membership lookup scoped by the authenticated User ID and requested Merchant ID, selecting only the fields needed to resolve context.

Context is available only when both the Merchant and MerchantMembership are `ACTIVE`. An ACTIVE Membership with no Roles is valid. Resolution then:

1. includes only assigned Roles whose status is `ACTIVE`;
2. orders Roles deterministically by name, then ID;
3. includes only assigned Permissions whose status is `ACTIVE`;
4. unions Permission keys across all included Roles;
5. removes duplicate keys; and
6. returns Permission keys in lexicographic order.

An ACTIVE Role with zero Permissions is valid. Role names are display metadata and carry no special authority. Disabled Roles and deprecated Permissions remain persisted but contribute no effective Permissions.

No merchant authorization result is cached in the Session, Redis, or process memory. Membership, Merchant, Role, and Permission lifecycle changes therefore affect the next context request without Session replacement.

## Successful response

HTTP 200 returns only safe context fields:

```json
{
  "merchant": {
    "id": "018f0000-0000-7000-8000-000000000001",
    "displayName": "Example Merchant"
  },
  "membership": {
    "id": "018f0000-0000-7000-8000-000000000002"
  },
  "roles": [
    {
      "id": "018f0000-0000-7000-8000-000000000003",
      "name": "Manager"
    }
  ],
  "permissions": ["order.read", "order.update"]
}
```

The response excludes contact details, credentials, Session identifiers or hashes, raw tokens, lifecycle fields, and persistence assignment records. It sets `Cache-Control: no-store` and `Pragma: no-cache`, does not renew the Session, and emits no `Set-Cookie` header.

## Request context separation

`MerchantContextGuard` attaches a resolved immutable-shaped context to `request.merchantContext`. It does not add Merchant, Membership, Role, or Permission data to `AuthenticatedPrincipal`. `@CurrentMerchantContext()` reads only the authorization context established by the guard.

This separation keeps the two questions explicit:

```text
request.auth             = who is the globally authenticated User?
request.merchantContext  = what can that User resolve in this requested Merchant?
```

## Permission evaluation

`PermissionEvaluator` is a pure exact-key evaluator over the resolved Permission set:

- `hasPermission(context, key)` checks one exact, case-sensitive key.
- `hasAllPermissions(context, keys)` requires every key and returns `true` for an empty requirement list.
- `hasAnyPermission(context, keys)` requires at least one key and returns `false` for an empty requirement list.

There are no wildcard semantics, deny rules, Role-name shortcuts, hierarchy, implication, or prefix matching. A key such as `order.*` is an ordinary literal key if it exists.

## Relationship to PermissionGuard

Merchant context resolution is not itself specific Permission enforcement. On a future protected merchant route, `MerchantContextGuard` resolves fresh PostgreSQL state and attaches `request.merchantContext`; B1.9's `PermissionGuard` then consumes that request-local context without another database query. The required order is `SessionAuthGuard`, `MerchantContextGuard`, then `PermissionGuard`.

The context endpoint deliberately retains B1.8 semantics: an ACTIVE Membership with zero Roles receives HTTP 200 with empty Roles and Permissions. See [PERMISSION_ENFORCEMENT.md](PERMISSION_ENFORCEMENT.md).

## Deferred work

- business endpoints protected by Permissions
- default Roles, default Permissions, and catalog seeding
- Role, Permission, MembershipRole, or staff-management APIs
- authorization caching and invalidation infrastructure
- deny rules, wildcard rules, hierarchical Roles, or Role-name authority
- audit events, outbox integration, and authorization administration
