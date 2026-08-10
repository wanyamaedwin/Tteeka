# Merchant Profile and Core Settings

## Purpose and boundary

B2.1 introduces Tteeka's first production merchant business module and the first real routes protected by the complete `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard` pipeline. It exposes the existing Merchant identity and cross-domain core settings without changing the Prisma schema or introducing a generic settings table.

The module owns four routes:

```text
GET   /api/v1/merchants/:merchantId/profile
PATCH /api/v1/merchants/:merchantId/profile
GET   /api/v1/merchants/:merchantId/settings
PATCH /api/v1/merchants/:merchantId/settings
```

All responses set `Cache-Control: no-store` and `Pragma: no-cache`. These operations do not create, rotate, renew, or revoke Sessions and emit no `Set-Cookie` header.

## Authorization and tenant authority

The routes declare one exact canonical Permission:

| Route            | Permission                 |
| ---------------- | -------------------------- |
| `GET profile`    | `merchant.profile.read`    |
| `PATCH profile`  | `merchant.profile.manage`  |
| `GET settings`   | `merchant.settings.read`   |
| `PATCH settings` | `merchant.settings.manage` |

Permissions are exact and case-sensitive. Manage does not imply read, Role names provide no authority, and there are no Owner/Admin bypasses, wildcard expansion, or deny rules. B2.1 defines these keys in application code but does not seed Permission or Role records; authorization bootstrap and staff/role administration remain B2.2 work.

After the guards run, controllers pass `request.merchantContext` through `@CurrentMerchantContext()`. `MerchantService` always uses `merchantContext.merchant.id`, never a separately trusted client tenant identifier. `PrismaMerchantStore` is a narrow Merchant-only persistence boundary and does not query Users, Sessions, Memberships, Roles, or Permissions.

## Profile API

The profile response contains only:

```json
{
  "id": "merchant UUID",
  "displayName": "Example Shop",
  "legalName": "Example Shop Limited",
  "phone": "+256772123456",
  "email": "shop@example.com"
}
```

`legalName`, `phone`, and `email` may be `null`. Status, timestamps, internal `phoneE164` naming, authorization context, User data, and Session data are not exposed.

Profile PATCH is a strict, non-empty partial object containing only `displayName`, `legalName`, `phone`, and `email`:

- `displayName` is trimmed, must contain 1–160 characters, and cannot be null.
- `legalName` is trimmed and limited to 200 characters; a blank string is rejected and explicit `null` clears it.
- `phone` reuses the authentication phone normalizer, accepts supported Uganda presentation forms, and persists canonical `+2567...` E.164; explicit `null` clears it.
- `email` is trimmed, structurally validated, limited to 320 characters, and lowercased; explicit `null` clears it. Merchant email is not globally unique.

Omitted fields remain unchanged. Unknown fields, an empty object, or cross-domain fields such as `currency`, `timezone`, and `status` receive HTTP 400 before a store write.

## Core settings API

The settings response contains only:

```json
{
  "currency": "UGX",
  "timezone": "Africa/Kampala"
}
```

Settings PATCH is a strict, non-empty partial object containing only `currency` and `timezone`:

- `currency` is trimmed, must be exactly three ASCII letters, and is stored uppercase. B2.1 performs no currency conversion or exchange-rate work.
- `timezone` is trimmed, limited to 64 characters, validated by Node's `Intl.DateTimeFormat`, and stored using its resolved canonical identifier where supported.

Order and Payment records will eventually snapshot their own currency. Financial-domain rules may later restrict changing a Merchant's currency after commercial history exists; no such history or restriction exists in B2.1.

## Deliberate omissions

The existing Merchant table already owns these six values, so B2.1 adds neither a `merchant_settings` table nor JSON/JSONB/key-value storage. Domain-specific policy belongs to the domain that can enforce it:

- COD eligibility, deposits, limits, and verification belong to payment/COD work.
- stock-hold triggers and expiry belong to inventory reservation work.
- delivery fees, zones, service levels, failed-delivery costs, and rider proof belong to fulfilment/delivery work.
- return windows, eligibility, and restocking fees belong to returns work.

B2.1 also adds no Merchant creation, deletion, lifecycle/status management, idempotency-key layer, audit log, or outbox. Mutable profile and settings changes will become auditable when the planned B14 audit/outbox foundation exists. B2.2 is expected to introduce deliberately reviewed staff, Role, Permission, and bootstrap administration rather than implicit defaults.
