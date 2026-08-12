# Draft Orders

## B6.1 scope

B6.1 introduces the Merchant-owned commercial `Order` aggregate in editable `DRAFT` form. It records current Customer, optional DeliveryLocation, and ProductVariant references while owning immutable commercial snapshots, quantities, unit prices, line totals, currency, and subtotal.

The frozen `OrderStatus` enum is `DRAFT`, `CONFIRMED`, `FULFILLED`, `COMPLETED`, `ABANDONED`, and `CANCELLED`. B6.1 creates only `DRAFT` and implements only `DRAFT -> ABANDONED` and `DRAFT -> CANCELLED`. Repeating the same terminal command is a no-op that preserves its timestamp. There is no reopening and no B6.1 transition to confirmation, fulfilment, or completion.

## Customer and delivery snapshots

Every new Order requires an ACTIVE Customer under the same Merchant. Creation snapshots nullable Customer name and required canonical Uganda phone. Later Customer edits or archive never rewrite the Order.

An ACTIVE DeliveryLocation under that same Merchant and Customer may be selected. Its area, landmark, contact phone, instructions, and map-pin URL are copied into bounded Order fields. Later reusable-location edits or archive do not change the snapshot. A DRAFT PATCH can select a different active location and replace the entire snapshot, or set `deliveryLocationId: null` and clear every location snapshot. Changing Customer refreshes the Customer snapshot and clears the prior location unless the same PATCH explicitly supplies a valid active location belonging to the new Customer.

## Item and price snapshots

`PUT /items` replaces the complete desired DRAFT item set with at most 100 unique Variant IDs. New lines require a Merchant-owned ACTIVE Product, ACTIVE Variant, and current positive selling price. No inventory quantity or sellable-stock validation occurs.

New OrderItems snapshot Product name, Variant SKU/size/colour, unit selling price, and price currency. Quantity and all money values use signed-PostgreSQL-BIGINT-safe arithmetic and decimal-string JSON. `lineTotal = quantity * unitSellingPrice`; Order subtotal is the line-total sum. All lines must share one currency and no conversion occurs.

An existing line preserves identity, price, and currency snapshots when only quantity changes—even if current catalogue identity, price, or lifecycle later changes. Removing a line deletes that DRAFT item. Re-adding it in a later request creates a fresh snapshot. Replacing with `[]` resets subtotal to `"0"` and currency to null. Identical desired state causes no timestamp or snapshot rewrite.

## Idempotency and concurrency

Order creation requires a case-sensitive visible-ASCII `Idempotency-Key` of 1–128 characters. PostgreSQL uniquely scopes it by Merchant. The stored lowercase SHA-256 request hash covers Customer ID and canonical DeliveryLocation ID/null but is never exposed. Exact replay returns the existing Order; different payload reuse returns HTTP 409; another Merchant may reuse the key.

Item replacement, Customer/location editing, cancel, and abandon lock the Order row in PostgreSQL. Each item PUT commits one complete desired state, and terminal transitions serialize with edits so no mutation can commit after a terminal state wins.

## Routes and permissions

All routes use `SessionAuthGuard -> MerchantContextGuard -> PermissionGuard` and no-store responses:

- `GET /api/v1/merchants/:merchantId/orders`
- `POST /api/v1/merchants/:merchantId/orders`
- `GET /api/v1/merchants/:merchantId/orders/:orderId`
- `PATCH /api/v1/merchants/:merchantId/orders/:orderId`
- `PUT /api/v1/merchants/:merchantId/orders/:orderId/items`
- `POST /api/v1/merchants/:merchantId/orders/:orderId/abandon`
- `POST /api/v1/merchants/:merchantId/orders/:orderId/cancel`
- `GET /api/v1/merchants/:merchantId/orders/:orderId/items`

GET routes require exact `orders.read`; commands require exact `orders.manage`. Neither implies the other. Order permissions are sufficient to validate supplied Customer, DeliveryLocation, and Variant references internally; customer/catalogue permissions are not additionally required.

The list supports `q` over Customer snapshots, exact Customer/status filters, timezone-aware `createdFrom` inclusive and `createdTo` exclusive filters, and page/pageSize pagination (defaults 1/20, maximum 100). Results order by creation time then UUID descending.

## Tenant and future-domain boundary

B6.2 now adds atomic `DRAFT -> CONFIRMED`, `CONFIRMED -> CANCELLED`, one Order-owned StockHold per OrderItem, and a ninth Orders route. Confirmation preserves every B6.1 commercial snapshot and changes neither physical inventory nor the ledger. See [ORDER_CONFIRMATION_STOCK_HOLDS.md](ORDER_CONFIRMATION_STOCK_HOLDS.md).

Orders, items, Customer/location references, and Variant references all use Merchant-scoped queries and restrictive composite foreign keys. Responses omit idempotency data, request hashes, current domain objects, stock, holds, authentication data, and future operational state.

B6.1 creates no StockHold, reservation, inventory movement, sale, confirmation endpoint, Payment/COD state, delivery job/zone/fee/rider, receipt, discount, tax, fulfilment type, friendly Order number, analytics, audit/outbox, or Redis authority. B6.2 later added confirmation and Order-owned holds. B7.1 later added independent PaymentTransactions: reporting locks the same Order row as item replacement, accepts only nonempty DRAFT or CONFIRMED Orders, and snapshots the Order currency without adding payment state to Order. See [PAYMENT_TRANSACTIONS.md](PAYMENT_TRANSACTIONS.md).

B8.1 later adds at most one independent DeliveryJob for a CONFIRMED Order with a complete delivery snapshot. Delivery creation locks the Order and copies only its frozen Customer/location snapshots; it never reads mutable source records. Delivery lifecycle does not change `Order.status`, including when an attempt marks the job DELIVERED or FAILED. See [DELIVERY_JOBS_ATTEMPTS.md](DELIVERY_JOBS_ATTEMPTS.md).
