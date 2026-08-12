# Permission Enforcement

## Purpose and boundary

B1.9 completes Tteeka's B1 authentication and authorization foundation by adding declarative, exact-Permission enforcement. B2.1 is its first production consumer through Merchant profile and core-settings routes.

B2.2 adds administration protected by four exact keys: `merchant.staff.read`, `merchant.staff.manage`, `merchant.roles.read`, and `merchant.roles.manage`. It still creates no default Roles, bypass semantics, or authorization audit domain.

## First production consumer

B2.1 declares its centralized constants rather than duplicating literals:

```ts
@RequirePermission(MERCHANT_PERMISSIONS.PROFILE_READ)
@RequirePermission(MERCHANT_PERMISSIONS.PROFILE_MANAGE)
@RequirePermission(MERCHANT_PERMISSIONS.SETTINGS_READ)
@RequirePermission(MERCHANT_PERMISSIONS.SETTINGS_MANAGE)
```

Each route still requires its exact key. A manage Permission does not imply read, and no Owner/Admin label bypasses the guard. See [MERCHANT_PROFILE_SETTINGS.md](MERCHANT_PROFILE_SETTINGS.md).

B2.2 applies the same rule to staff, Role, Role-assignment, Role-Permission, and catalog routes. Replacing a Membership's Roles requires `merchant.roles.manage`; `merchant.staff.manage` is insufficient. Role administration is itself authorization configuration protected by exact Permissions. See [STAFF_ROLE_ADMINISTRATION.md](STAFF_ROLE_ADMINISTRATION.md).

B3.1 applies `catalogue.read` to Product list/detail and `catalogue.manage` to Product create/update. Every Product route uses the same three-guard pipeline. A manage-only caller may POST/PATCH but receives 403 from GET list/detail; manage never implies read. See [PRODUCT_CATALOGUE.md](PRODUCT_CATALOGUE.md).

B3.2 adds `catalogue.price.manage` for Variant current-price PUT and price-history reads. `catalogue.read` covers ordinary Variant list/detail/lookup and selling-price visibility, while `catalogue.manage` covers Variant identity, metadata, and lifecycle changes. Cost is visible only behind price management. Read, manage, and price-manage are exact independent capabilities with no implied hierarchy. See [PRODUCT_VARIANTS_PRICING.md](PRODUCT_VARIANTS_PRICING.md).

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
- default Roles or implicit ownership semantics
- additional commerce modules and their real Permission requirements
- authorization audit events and outbox integration
- wildcard, deny, hierarchy, inheritance, or Role-name authority
- authorization caching or invalidation infrastructure

# B4.1 inventory permissions

`inventory.read` protects inventory list, detail, and ledger history. `inventory.manage` protects receipts and manual positive/negative adjustments. They are exact independent permissions: neither implies the other, and changes are evaluated from current database grants without re-login.

# B5 customer permissions

`customers.read` protects all Customer and nested DeliveryLocation GET routes. `customers.manage` protects all Customer and nested DeliveryLocation POST/PATCH routes. A manage-only caller may execute a write when the IDs and payload are already known but receives 403 from list/detail routes; manage does not imply read. Both use the standard Session, Merchant-context, and exact-Permission guard chain. The explicit catalog now has 15 keys, while `permissions:sync` remains manual and creates no Role grants. See [CUSTOMERS_DELIVERY_LOCATIONS.md](CUSTOMERS_DELIVERY_LOCATIONS.md).

# B6.1 order permissions

`orders.read` protects Order list/detail and OrderItem reads. `orders.manage` protects draft creation, Customer/location PATCH, desired-state item PUT, abandon, and cancel. They are exact independent grants: manage does not expose GET routes and read cannot mutate Orders.

Order snapshots are Order-owned commercial data, so `orders.read` does not additionally require `customers.read` or `catalogue.read`. Likewise, known Customer/location/Variant references supplied to commands are validated internally under `orders.manage` without Customer or Catalogue grants. The explicit catalog now has 17 keys; manual synchronization still creates no grants or Roles. See [DRAFT_ORDERS.md](DRAFT_ORDERS.md).

B6.2 keeps the catalogue at 17 keys. `orders.manage` alone permits confirmation and internal StockHold coordination; Inventory permissions are not required. `orders.read` alone exposes the safe OrderItem Hold summary but no general Inventory endpoints. Conversely, `inventory.read` may see a normal Hold representation without Order/OrderItem linkage, Customer data, or commercial snapshots. See [ORDER_CONFIRMATION_STOCK_HOLDS.md](ORDER_CONFIRMATION_STOCK_HOLDS.md).

# B7.1 payment permissions

`payments.read` protects Order-scoped PaymentTransaction list/detail and the derived payment summary. `payments.manage` protects reporting, verification-pending, verify, and reject commands. They are exact independent grants: manage does not expose reads and read cannot mutate financial history.

Payment permissions are also independent from Order permissions. A caller with the appropriate Payment grant may operate on a known Order ID without `orders.read` or `orders.manage`; the Payment service performs scoped internal validation. Conversely, `orders.read` alone exposes no PaymentTransaction list, detail, or summary. The explicit catalog now has 19 keys, while synchronization remains an explicit operation and creates no grants or Roles. See [PAYMENT_TRANSACTIONS.md](PAYMENT_TRANSACTIONS.md).

B7.2 adds no Permission. Exact `payments.manage` permits provider verification of a known Mobile Money Payment but does not expose attempt history. Exact `payments.read` permits bounded attempt history but cannot initiate verification. Neither requires an Order permission, and `orders.read` alone grants neither route. The catalog remains 19 keys with explicit, idempotent, non-startup synchronization and no automatic Role grants. See [MOBILE_MONEY_PROVIDER_VERIFICATION.md](MOBILE_MONEY_PROVIDER_VERIFICATION.md).
