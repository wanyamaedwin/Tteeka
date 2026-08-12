# Delivery jobs and attempts

## B8.1 scope

B8.1 introduces Delivery as an independent operational domain. A Merchant may create at most one `DeliveryJob` for a `CONFIRMED` Order that already owns a complete delivery-location snapshot. Delivery status is not Order, Payment, StockHold, or Inventory status: no Delivery command fulfils or completes an Order, verifies or requires a Payment, changes physical stock or ledger history, or creates, consumes, releases, extends, or expires a StockHold.

Creation accepts exactly `{ orderId }` and locks that Merchant-owned Order before validating eligibility. It requires non-null `deliveryLocationId`, area, landmark, and delivery-phone snapshots. The recipient name and phone plus area, landmark, contact phone, instructions, and map-pin URL are copied exclusively from the frozen Order snapshot; current Customer and reusable DeliveryLocation records are not consulted. These Delivery-owned snapshots never follow later source edits. A later Order cancellation or effective Hold expiry does not automatically change an existing DeliveryJob.

## Lifecycle

The exact states are `PENDING`, `READY`, `DISPATCHED`, `DELIVERED`, `FAILED`, and `CANCELLED`:

- `PENDING -> READY` or `PENDING -> CANCELLED`
- `READY -> DISPATCHED` or `READY -> CANCELLED`
- `DISPATCHED -> DELIVERED` only through a successful DeliveryAttempt
- `DISPATCHED -> FAILED` only through a failed DeliveryAttempt

Ready, dispatch, and cancel are desired-state commands. Repeating the achieved target returns the current job without rewriting its lifecycle timestamp. Dispatch from PENDING, cancellation after dispatch, reopening, rescheduling, and every other transition are rejected. Every mutating command locks the DeliveryJob row, so competing ready/cancel, dispatch/cancel, and delivered/failed operations commit one coherent result without mixed timestamps.

## Delivery attempts

`DeliveryAttempt` is immutable, append-only evidence recorded only while a job is `DISPATCHED`. Results are exactly `DELIVERED` and `FAILED`. A delivered attempt requires a null/omitted failure reason; a failed attempt requires exactly one of `CUSTOMER_UNREACHABLE`, `CUSTOMER_UNAVAILABLE`, `CUSTOMER_REFUSED`, `WRONG_LOCATION`, `ADDRESS_NOT_FOUND`, `VEHICLE_OR_RIDER_ISSUE`, `WEATHER_OR_ACCESS_ISSUE`, or `OTHER`.

The optional note is trimmed, converts blank input to null, and is limited to 500 characters. `attemptedAt` is server time. The server allocates a sequential number within the DeliveryJob, protected by the job lock and a tenant-scoped database uniqueness constraint. In the same transaction it inserts the attempt, moves the job to the corresponding terminal state, and sets `deliveredAt` or `failedAt` to the attempt timestamp. B8.1 terminal failure means a normal job has one completed attempt; the sequence preserves a future retry-history model without enabling retries now.

## Idempotency and tenancy

Delivery creation and attempt recording require a case-sensitive visible-ASCII `Idempotency-Key` of 1-128 characters, unique per Merchant. Creation hashes canonical Order ID. Attempt recording hashes canonical DeliveryJob ID, result, failure reason/null, and normalized note/null. Exact replay returns the original record without duplicate events or timestamp rewrites; mismatched key reuse conflicts. A different creation key for an Order that already owns a DeliveryJob also conflicts. Concurrent same-key creation returns one job, while different keys still cannot defeat the `(merchantId, orderId)` uniqueness authority.

Merchant-qualified queries and composite foreign keys isolate Orders, DeliveryJobs, and DeliveryAttempts. Foreign resources, including a wrong nested DeliveryJob/Attempt relationship, are concealed. API responses never expose idempotency keys, request hashes, Session/authentication data, Customer credentials, or Payment internals.

## Routes and permissions

The eight no-store routes are:

- `GET/POST /api/v1/merchants/:merchantId/deliveries`
- `GET /api/v1/merchants/:merchantId/deliveries/:deliveryId`
- `POST .../deliveries/:deliveryId/ready`
- `POST .../deliveries/:deliveryId/dispatch`
- `POST .../deliveries/:deliveryId/cancel`
- `GET/POST .../deliveries/:deliveryId/attempts`

Exact `deliveries.read` protects list, detail, and attempt history. Exact `deliveries.manage` protects creation and lifecycle commands. Neither implies the other, and neither requires Orders, Payments, Inventory, Customer, or Catalogue permissions for a known identifier.

Delivery lists support `q` across recipient/contact/location snapshots, exact `orderId` and status, timezone-aware `createdFrom` inclusive and `createdTo` exclusive, and page/pageSize pagination (defaults 1/20, maximum 100). Results use `createdAt DESC, id DESC`. Attempt history supports exact result and failure-reason filters plus the same pagination bounds, ordered by `attemptNumber DESC, id DESC`.

## Deferred boundaries

B8.1 has no DeliveryZone, fee, scheduling, Rider or assignment, route optimization, split shipment, parcel, proof-of-delivery photo/signature/GPS, COD or rider-cash collection, returns/reverse logistics, worker, queue, outbox, or automatic Order fulfilment/Inventory consumption. B8.2 owns zones, fees, and scheduling; B8.3 owns riders and assignment; B9 owns authoritative fulfilment and inventory consumption. Payment settlement, COD reconciliation, receipts, and returns remain later reviewed stages.
