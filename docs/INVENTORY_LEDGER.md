# Inventory ledger and AVAILABLE stock

B4.1 introduces inventory as a domain separate from catalogue. `ProductVariant` is the stable identity inventory references, but it deliberately has no quantity, stock, on-hand, available, or held field. Catalogue lifecycle and pricing do not own physical stock: ACTIVE, INACTIVE, ARCHIVED, and unpriced Variants may all be reconciled.

## Ledger and projection

`InventoryLedgerEntry` is append-only authoritative movement history. `InventoryBalance` is the efficient current projection keyed by Merchant, Variant, and `InventoryState`. A successful command appends one ledger entry and updates the corresponding balance in one PostgreSQL transaction. No API directly sets a balance, and production code has no ledger update/delete path.

B4.1 contains only `InventoryState.AVAILABLE`. A Variant without history implicitly has available quantity zero and needs no balance row; the first movement lazily creates the row. B4.2 may add `HELD` and state-to-state movements without redesigning ProductVariant.

Movements are whole-unit positive BIGINT values:

- `RECEIPT`: external/null → AVAILABLE; note optional.
- `ADJUSTMENT_IN`: external/null → AVAILABLE; explanatory note required.
- `ADJUSTMENT_OUT`: AVAILABLE → external/null; explanatory note required.

The ledger stores the post-movement balance snapshot on the non-null state side. Database checks require positive movement quantities, nonnegative snapshots and balances, a non-null state side, consistent state/snapshot nullability, and distinct states when both exist. The application rejects an outbound movement that would make AVAILABLE negative with HTTP 422, leaving both ledger and projection unchanged.

Quantities are PostgreSQL BIGINT and JSON decimal strings. Inputs must be positive decimal integer strings no greater than 9223372036854775807; fractions, signs, exponents, commas, units, zero, negatives, and overflow are rejected. JavaScript number arithmetic and direct Prisma BigInt serialization are not used.

## HTTP API

All routes use `SessionAuthGuard → MerchantContextGuard → PermissionGuard`, trust `merchantContext.merchant.id`, return `Cache-Control: no-store` and `Pragma: no-cache`, and conceal foreign Variant existence behind the same `404 Not found.` response as an unknown Variant.

- `GET /api/v1/merchants/:merchantId/inventory` (`inventory.read`) lists every tenant Variant, including zero-stock Variants. It accepts only `q`, `productId`, Variant `status`, `page`, and `pageSize`. Search covers SKU, barcode, size, colour, and Product name. Ordering is Product name, SKU, then Variant id.
- `GET /api/v1/merchants/:merchantId/inventory/:variantId` (`inventory.read`) returns bounded Variant/Product identity, `availableQuantity`, and nullable `inventoryUpdatedAt`.
- `GET /api/v1/merchants/:merchantId/inventory/:variantId/ledger` (`inventory.read`) accepts only movement `type`, `page`, and `pageSize`; history is newest first by createdAt then id.
- `POST /api/v1/merchants/:merchantId/inventory/:variantId/movements` (`inventory.manage`) accepts a strict `{ type, quantity, note? }` body and returns HTTP 200 for new commands and exact replays.

`inventory.read` and `inventory.manage` are exact independent permissions. Manage does not imply read and read does not imply manage.

## Idempotency and concurrency

Every movement requires a 1–128 character visible-ASCII `Idempotency-Key`. It is opaque, case-sensitive, never normalized, and unique per Merchant. The inventory-local fingerprint is lowercase SHA-256 over deterministic JSON containing Variant id, type, canonical quantity, and normalized note/null; Node built-in crypto is used. Neither the key nor hash is exposed through APIs or intentionally logged.

An identical retry returns the original movement without changing its id, createdAt, ledger count, or balance. Reusing the key for a different Variant or normalized command returns HTTP 409. Different Merchants may reuse the same key. This safeguard is local to inventory and does not implement the later generic B14 idempotency framework.

New writes verify the tenant-scoped Variant, insert the AVAILABLE projection with `ON CONFLICT DO NOTHING`, lock it with PostgreSQL `FOR UPDATE`, derive and validate the next quantity, insert history, and update projection in one transaction. Database uniqueness resolves concurrent key races. PostgreSQL is authoritative; there is no Redis/in-memory stock cache or process lock.

The inventory ledger is stock-domain history, not a generic audit log or outbox. B4.1 has no HELD state, StockHold, reservation, expiry, order/sale movement, warehouse/bin, transfer, return inspection, or stock cache.
