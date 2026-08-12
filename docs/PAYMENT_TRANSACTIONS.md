# Payment transactions and manual verification

## B7.1 scope

B7.1 introduces `PaymentTransaction` as an independent, Merchant-owned financial record attached to an Order. An Order may have multiple transactions. Payment reporting, verification, and summary derivation do not mutate Order status, StockHolds, InventoryBalance, or InventoryLedgerEntry.

The supported methods are exactly `CASH`, `MTN_MOMO`, and `AIRTEL_MONEY`. The persisted transaction statuses are `REPORTED`, `VERIFICATION_PENDING`, `VERIFIED`, `REJECTED`, `FAILED`, `REVERSED`, and `REFUNDED`. B7.1 commands produce only the first four statuses. Failure production, reversal, refund execution, settlement, reconciliation, receipts, and provider integration remain deferred.

## Model and reporting

Each transaction stores its Merchant and Order, method, status, positive BIGINT amount, server-snapshotted Order currency, optional payer phone/provider reference/Merchant reference/note, lifecycle timestamps, a Merchant-local idempotency key and request hash, and creation/update timestamps. API money values are decimal strings and authoritative arithmetic uses `bigint`, never JavaScript `number`.

New reports are accepted only for DRAFT and CONFIRMED Orders with a non-null commercial currency. An empty DRAFT Order is rejected. The report locks the Order row, matching DRAFT item replacement, so state and currency validation serialize with commercial edits. Existing transactions survive cancellation or abandonment unchanged; neither transition deletes, reverses, or refunds financial history.

CASH may include an optional normalized Uganda payer phone, Merchant reference, and note, but never a provider reference. MTN_MOMO and AIRTEL_MONEY require a payer phone, normalized through the shared Uganda phone utility; their provider reference is optional, opaque, trimmed, and non-unique. Blank optional text becomes null. References are bounded to 160 characters and notes to 500.

Every report starts REPORTED and receives its server-side `reportedAt`. CASH is not auto-verified. Mobile Money is not contacted automatically. The request body cannot set currency, status, totals, or timestamps and strictly rejects screenshot, image, attachment, and all other unknown fields. A customer screenshot is never verification.

## Idempotency

Reporting requires a case-sensitive visible-ASCII `Idempotency-Key` of 1–128 characters, unique within a Merchant. A lowercase SHA-256 fingerprint covers canonical Order ID, method, amount, normalized payer phone/null, provider reference/null, Merchant reference/null, and note/null. Exact replay returns the original transaction; reuse for another payload or Order returns conflict; another Merchant may reuse the same key. Neither key nor hash is returned by the API.

## Manual lifecycle and locking

Mobile Money may move REPORTED to VERIFICATION_PENDING, setting `verificationPendingAt`; CASH cannot. CASH may move REPORTED to VERIFIED. Mobile Money may move REPORTED or VERIFICATION_PENDING to VERIFIED. REPORTED or VERIFICATION_PENDING may move to REJECTED. Already-pending, verified, or rejected commands return the current record without rewriting the corresponding timestamp.

Payment commands lock the PaymentTransaction row. Verify and reject therefore serialize: exactly one terminal direction can win and a transaction cannot contain hybrid verified/rejected timestamps. VERIFIED cannot be rejected and REJECTED cannot be verified. In B7.1, VERIFIED means an authorized Merchant user manually verified the payment; it does not claim provider or Mobile Money API verification.

## Routes, permissions, and isolation

The seven Order-scoped routes are:

- `GET/POST /api/v1/merchants/:merchantId/orders/:orderId/payments`
- `GET /api/v1/merchants/:merchantId/orders/:orderId/payments/:paymentId`
- `POST .../payments/:paymentId/verification-pending`
- `POST .../payments/:paymentId/verify`
- `POST .../payments/:paymentId/reject`
- `GET /api/v1/merchants/:merchantId/orders/:orderId/payment-summary`

List, detail, and summary require exact `payments.read`. Reporting and lifecycle commands require exact `payments.manage`. Neither Permission implies the other, and no Orders Permission is additionally required for a known Order ID. Conversely, `orders.read` alone exposes no PaymentTransaction detail.

All operations scope Merchant, Order, and Payment identifiers together. Composite database ownership prevents cross-Merchant attachment, and foreign Merchant, foreign Order, and wrong-Order Payment targets are concealed. Responses expose only bounded transaction fields and never Session data, credentials, provider secrets, idempotency keys, or request hashes.

Lists support exact status and method filters, page/pageSize defaults of 1/20 and maximum 100, ordered by `createdAt DESC` then `id DESC`. There is no global Payment search or Customer financial aggregate.

## Derived Order payment summary

The summary is computed from the Order subtotal and its transactions; no mutable payment status, amount-paid, or amount-due column is stored on Order. Only VERIFIED transactions contribute to `verifiedAmount`. REPORTED, VERIFICATION_PENDING, REJECTED, FAILED, REVERSED, and currently non-producible REFUNDED records contribute zero under B7.1 rules.

The response-only status vocabulary is `UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERPAID`, and future-compatible `REFUNDED`. With `orderAmount = Order.subtotal`, amount due is the nonnegative difference from verified amount. Excess produces OVERPAID and an `overpaidAmount`; valid verification is not rejected merely because it overpays. A zero-subtotal Order with no verified payment deliberately remains UNPAID rather than PAID. B7.1 cannot normally derive REFUNDED because refund arithmetic and commands are deferred.

## B7.2 and later boundary

B7.1 adds no MTN or Airtel API calls, webhooks, automatic verification, screenshot upload, provider settlement, reconciliation, COD settlement, rider cash, delivery collection, receipt issuance, refund command, wallet, credit, retry worker, scheduler, queue, Redis authority, audit, or outbox. Those capabilities require separately reviewed later stages.

## B7.2 provider-verification extension

B7.2 adds nullable MANUAL/PROVIDER `verificationSource`, tenant-safe immutable provider-verification attempts, and explicit provider-verify/attempt-history routes. Existing B7.1 VERIFIED records are backfilled as MANUAL. Manual and exact provider verification contribute identically to the existing verified-only summary.

The provider adapter is invoked between two short database transactions, so no Payment row lock spans provider I/O. Production has no configured live adapter and fails safely without claiming verification. Provider lookup failures remain attempt evidence and never imply Payment FAILED or REJECTED. See [MOBILE_MONEY_PROVIDER_VERIFICATION.md](MOBILE_MONEY_PROVIDER_VERIFICATION.md).

## B7.3A MTN transport boundary

B7.3A adds a standalone sandbox-only MTN Collections RequestToPay client and developer smoke command without connecting it to PaymentTransaction, provider-verification attempts, or public routes. MTN's 202 response means asynchronous acceptance only, never Payment VERIFIED. Sandbox EUR values are synthetic provider-contract inputs and never convert or mutate Tteeka Order/Payment currency. See [MTN_MOMO_COLLECTIONS_SANDBOX.md](MTN_MOMO_COLLECTIONS_SANDBOX.md).

## B8.1 Delivery boundary

B8.1 adds DeliveryJobs and DeliveryAttempts without introducing a payment prerequisite or copying a payment summary. A job may be created and operated for a CONFIRMED Order regardless of unpaid, partially paid, or verified-payment state. Delivery creation, ready, dispatch, cancel, and delivered/failed attempts never mutate PaymentTransactions or their derived summary; Delivery also implements no COD or rider-cash collection. See [DELIVERY_JOBS_ATTEMPTS.md](DELIVERY_JOBS_ATTEMPTS.md).
