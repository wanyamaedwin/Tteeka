# Stock holds and reservation expiry

B4.2 adds temporary reservations as `StockHold` records without changing physical stock or the append-only inventory ledger. A hold belongs to one Merchant and ProductVariant, has a positive whole-unit BIGINT quantity, a mandatory timezone-aware expiry, and one lifecycle state: `ACTIVE`, `RELEASED`, or `EXPIRED`.

## Quantity model

`availableQuantity` remains the physical AVAILABLE balance. `heldQuantity` is the sum of persisted ACTIVE holds whose `expiresAt` is later than evaluation time. `sellableQuantity = availableQuantity - heldQuantity`. All three are decimal strings. Inventory list uses one grouped query for its page; detail uses one aggregate, with no per-row hold queries.

Holds never append ledger rows or update InventoryBalance. Creating, releasing, expiring, or rescheduling a hold changes reservation records only. InventoryState remains exactly AVAILABLE and movement types remain RECEIPT, ADJUSTMENT_IN, and ADJUSTMENT_OUT.

## HTTP API

All routes use the existing session, Merchant-context, and exact-Permission guard chain, trust the resolved Merchant id, conceal foreign resources as not found, and return no-store headers.

- `GET /api/v1/merchants/:merchantId/inventory/:variantId/holds` (`inventory.read`) filters by effective status and paginates newest first.
- `POST /api/v1/merchants/:merchantId/inventory/:variantId/holds` (`inventory.manage`) requires Idempotency-Key and strict `{ quantity, expiresAt }`.
- `GET /api/v1/merchants/:merchantId/inventory/:variantId/holds/:holdId` (`inventory.read`) returns bounded hold data.
- `PUT /api/v1/merchants/:merchantId/inventory/:variantId/holds/:holdId/expiry` (`inventory.manage`) accepts strict `{ expiresAt }`. Only effectively active holds change; shortening is allowed and identical input is a no-op.
- `POST /api/v1/merchants/:merchantId/inventory/:variantId/holds/:holdId/release` (`inventory.manage`) is lifecycle-idempotent; a due active hold becomes EXPIRED.

Expiry inputs require a timezone and must be future times for create/update. The hold fingerprint is lowercase SHA-256 over Variant id, canonical quantity, and canonical UTC expiry. Identical retries return the original; different content under the same Merchant-local key returns 409. Keys and hashes are not exposed.

## Capacity and concurrency

Hold creation and ADJUSTMENT_OUT lazily establish and lock the same `(merchantId, variantId, AVAILABLE)` row with PostgreSQL `FOR UPDATE`. Creation sums effective active holds and rejects quantities above sellable stock. Outbound adjustment rejects results below held quantity. Concurrent holds cannot oversell, and hold/outbound races are safe in either commit order. No Redis or process lock participates.

## Effective expiry and processor

Expiry is effective at `expiresAt` even before persistence catches up: due ACTIVE rows do not contribute to held quantity, match effective EXPIRED filtering, and serialize as EXPIRED. The internal expiry service processes bounded batches with a PostgreSQL `FOR UPDATE SKIP LOCKED` CTE and records `expiredAt = expiresAt`. It has no public route, scheduler, or queue.

## Deferred scope

B6.2 Order confirmation creates StockHolds internally, one per OrderItem. Generic create cannot submit the internal association; generic reads hide it; generic release and expiry update conflict for Order-owned Holds. The expiry processor handles both generic and Order Holds and never mutates Order status. See [ORDER_CONFIRMATION_STOCK_HOLDS.md](ORDER_CONFIRMATION_STOCK_HOLDS.md).

Order ownership, checkout, sale consumption, partial release, policy limits, warehouses/bins/transfers, fulfillment states, Redis caching, scheduling, notifications, audit/outbox, and generic B14 idempotency remain deferred.
