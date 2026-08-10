# Permission Enforcement

## Purpose and boundary

B1.9 completes Tteeka's B1 authentication and authorization foundation by adding declarative, exact-Permission enforcement. B2.1 is its first production consumer through Merchant profile and core-settings routes.

Default Permissions, default Roles, authorization administration, broader commerce APIs, and authorization auditing remain deferred.

## First production consumer

B2.1 declares its centralized constants rather than duplicating literals:

```ts
@RequirePermission(MERCHANT_PERMISSIONS.PROFILE_READ)
@RequirePermission(MERCHANT_PERMISSIONS.PROFILE_MANAGE)
@RequirePermission(MERCHANT_PERMISSIONS.SETTINGS_READ)
@RequirePermission(MERCHANT_PERMISSIONS.SETTINGS_MANAGE)
```

Each route still requires its exact key. A manage Permission does not imply read, and no Owner/Admin label bypasses the guard. See [MERCHANT_PROFILE_SETTINGS.md](MERCHANT_PROFILE_SETTINGS.md).

## Required guard pipeline

A future protected merchant route composes three route-scoped guards in this order:

```ts
@UseGuards(
  SessionAuthGuard,
  MerchantContextGuard,
  PermissionGuard,
)
@RequirePermission('order.read')
```

`order.read` is illustrative until a reviewed Permission catalog introduces it. Each layer has one responsibility:

1. `SessionAuthGuard` authenticates the opaque Session and writes global User/Session identity to `request.auth`.
2. `MerchantContextGuard` validates the explicit `:merchantId`, resolves current PostgreSQL Membership, Role, and Permission state, and writes `request.merchantContext`.
3. `PermissionGuard` reads route metadata and checks the already-resolved request-local context through `PermissionEvaluator`.

The guards are not global. B1.9 introduces no `APP_GUARD` or `@Public` infrastructure because no substantial commerce route surface exists yet.

## RequirePermission metadata

`@RequirePermission` declares exactly one required Permission key on a controller class or method. Method metadata takes precedence over class metadata; requirements are not merged. The exact developer-supplied string is retained without lowercasing, uppercasing, trimming, or other normalization.

An empty or whitespace-only declaration throws during class/module evaluation. This fail-fast check only ensures a useful non-empty declaration; it does not add a new persisted-key regex or establish the future Permission catalog.

## Exact grant semantics

Permission matching is exact and case-sensitive:

- `order.read` does not match `Order.Read` or `order`.
- `order.*` has no wildcard meaning and matches only a literal effective key named `order.*`.
- no deny, negative Role, priority, override, hierarchy, or inheritance semantics exist.
- Role names never grant authority, and Owner/Admin names provide no bypass.

`PermissionGuard` delegates the decision to `PermissionEvaluator.hasPermission`. It performs no Prisma, AuthorizationStore, AuthStore, Session, Membership, Role, or Permission lookup and does not mutate either request context.

## Error behavior

The complete pipeline produces:

| Condition                                         | Result                        |
| ------------------------------------------------- | ----------------------------- |
| Missing or invalid Session                        | generic HTTP 401              |
| Malformed Merchant UUIDv7                         | HTTP 400                      |
| Unavailable Merchant context                      | generic HTTP 403              |
| Required Permission absent                        | generic HTTP 403 `Forbidden.` |
| PostgreSQL resolution failure                     | 500-class response            |
| PermissionGuard without requirement metadata      | generic 500-class response    |
| PermissionGuard without `request.merchantContext` | generic 500-class response    |

Permission denials expose neither the required key nor the caller's Roles, effective Permissions, or Membership details. Missing metadata and missing context are developer route-configuration errors, not ordinary authorization denials; the guard therefore fails closed with a generic internal error instead of allowing or returning 403.

## PostgreSQL authority and request-local state

`request.merchantContext` is a snapshot scoped only to the current request. It is not a Session, Redis, or long-lived process cache. `MerchantContextGuard` resolves current PostgreSQL state immediately before `PermissionGuard`, so Role disabling and Permission deprecation affect the next request without re-login. One global Session can still resolve independent Permission sets for different Merchants, with no cross-Merchant grant leakage.

## Test-only controller strategy

B1.9 validates real HTTP behavior with a controller declared inside `permission-guard.e2e.spec.ts`. Its synthetic routes use the real three-guard pipeline, real PostgreSQL records, and synthetic keys such as `test.resource.read`. The controller is registered only in a test module and is absent from `AppModule`, `AuthorizationModule.controllers`, and the production route map.

The existing Merchant-context endpoint remains an inspection endpoint rather than a permission-protected business operation. An ACTIVE Membership with zero Roles still receives HTTP 200 there with empty Roles and Permissions, while a test business route requiring a Permission correctly receives HTTP 403.

## Deferred work

- multi-Permission route metadata and any/all composition
- a global secure-by-default guard policy
- a stable default Permission catalog and default Roles
- Role, Permission, Membership, and staff-management APIs
- additional commerce modules and their real Permission requirements
- authorization audit events and outbox integration
- wildcard, deny, hierarchy, inheritance, or Role-name authority
- authorization caching or invalidation infrastructure
