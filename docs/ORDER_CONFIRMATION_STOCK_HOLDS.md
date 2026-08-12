# Order confirmation and StockHold coordination

## B6.2 scope

B6.2 implements atomic `DRAFT -> CONFIRMED` at `POST /api/v1/merchants/:merchantId/orders/:orderId/confirm`. The strict body is `{ expiresAt }`, a visible-ASCII `Idempotency-Key` is required, and exact `orders.manage` is sufficient. Expiry must be timezone-aware, canonicalizes to UTC, and must be later than operation time.

Confirmation rejects empty Orders and never resnapshots or reprices commercial contents. Customer, DeliveryLocation, Product, Variant, price, currency, line total, and subtotal snapshots remain authoritative even when source records are edited, archived, inactive, or unpriced after draft creation.

## Atomic reservation

PostgreSQL is the sole authority. One transaction locks the Order row, validates idempotency and DRAFT status, loads the complete item set, locks every canonical AVAILABLE balance row in ascending Variant-ID order, aggregates effective active Holds, validates every line, creates exactly one StockHold per OrderItem, and records CONFIRMED plus confirmation metadata. A failure rolls back every Hold and all Order metadata.

`availableQuantity` remains physical stock. Confirmation changes neither InventoryBalance nor InventoryLedgerEntry. Effective `heldQuantity` includes generic and Order-owned ACTIVE Holds with future expiry; `sellableQuantity = availableQuantity - heldQuantity`. Due ACTIVE, RELEASED, and EXPIRED Holds consume no capacity.

The transaction-aware allocator is shared with generic Hold creation. Both paths lazily create and lock the same AVAILABLE row and use the same capacity and expiry semantics. Redis is not involved.

## Association and privacy

An Order-created Hold has an internal nullable `orderItemId`. The composite `(merchantId, orderItemId)` foreign key prevents cross-Merchant association. Generic Holds keep it null and generic create remains exactly `{ quantity, expiresAt }`.

Order item reads expose only `id`, decimal-string `quantity`, effective `status`, `expiresAt`, `releasedAt`, and `expiredAt`. `orders.read` is sufficient. Generic Inventory reads may show the Hold but never expose Order, OrderItem, Customer, or snapshot associations. Neither API exposes Hold idempotency/hash fields or Order confirmation key/hash fields. Generic expiry update and release reject Order-owned Holds.

## Idempotency and concurrency

Confirmation stores a Merchant-scoped unique key and deterministic lowercase SHA-256 over canonical Order ID and expiry. Exact replay returns the existing Order and Holds without rewriting timestamps. Reusing the key for another Order/expiry, or confirming an already-confirmed Order under another key, conflicts. Another Merchant may reuse the key.

The Order row lock serializes confirmation against item replacement, Customer/location PATCH, abandon, cancel, and competing confirms. Deterministic Variant locking avoids multi-line deadlocks and shares capacity serialization with generic Holds and ADJUSTMENT_OUT.

## Expiry and cancellation

Hold expiry is independent of Order status. A CONFIRMED Order remains CONFIRMED when Holds expire; no automatic cancellation, reopening, renewal, replacement, or re-reservation occurs.

B6.2 supports `CONFIRMED -> CANCELLED`. Cancellation locks the Order and associated Holds, releases active unexpired Holds, persists due active Holds as EXPIRED with `expiredAt = expiresAt`, and records cancellation. Replays preserve timestamps. DRAFT cancellation remains unchanged; CONFIRMED abandon is forbidden.

## Boundary

B6.2 adds no FULFILLED/COMPLETED transition, hold consumption, Inventory movement, SALE movement, HELD InventoryState, Payment/COD, Delivery/rider/fee/zone, receipts, scheduler, Redis authority, audit, or outbox.
