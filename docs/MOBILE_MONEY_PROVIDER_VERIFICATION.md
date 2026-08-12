# Mobile Money provider verification foundation

## B7.2 scope

B7.2 adds provider-verification evidence and an integration boundary without adding live MTN or Airtel networking. `PaymentTransaction.status` remains the financial lifecycle. Provider outcomes are recorded separately and only exact verified evidence may move a Payment to `VERIFIED`.

`PaymentTransaction.verificationSource` is nullable until verification and is exactly `MANUAL` or `PROVIDER`. Existing B7.1 VERIFIED rows are migrated to MANUAL. The existing manual verify command sets MANUAL on its first successful transition and replays never rewrite a PROVIDER source.

## Verification attempts

`PaymentVerificationAttempt` is a tenant-safe child of PaymentTransaction. It snapshots provider, provider reference, canonical payer phone, BIGINT amount, and currency when requested, plus bounded normalized provider evidence, failure information, request/completion timestamps, and Merchant-local idempotency metadata.

Attempt statuses are:

- `PENDING`: the internal request was established but no result was applied.
- `VERIFIED`: exact provider evidence confirms the snapshotted transaction.
- `NOT_VERIFIED`: the provider responded, but the evidence did not confirm the transaction.
- `FAILED`: adapter/provider communication failed technically.

NOT_VERIFIED does not reject the Payment. FAILED does not set `PaymentTransaction.status = FAILED`; lookup failure is not proof that the underlying transfer failed.

## Provider-neutral adapter contract

The adapter port receives only canonical provider, Payment correlation ID, provider reference, payer phone, amount, and currency. It returns normalized VERIFIED, NOT_VERIFIED, or FAILED evidence. MTN/Airtel SDK objects, raw JSON, HTTP headers, access tokens, secrets, and full responses never enter persistence.

A focused registry resolves `MTN_MOMO` or `AIRTEL_MONEY` to an adapter. Production registers an empty registry in B7.2. Provider verification therefore returns a bounded unavailable response and records a failed attempt instead of falling back to manual verification or claiming success. Deterministic adapters are injected only by tests.

## Three-phase architecture

Provider verification always follows three phases:

1. A transaction locks the Payment row, validates Merchant/Order/Payment ownership, method, state, and provider reference, establishes or replays one PENDING attempt, snapshots immutable expected values, and commits.
2. The adapter is invoked outside every database transaction. No Payment row lock is held while future provider I/O waits.
3. A transaction locks Payment and then Attempt, finalizes still-PENDING evidence, and moves an eligible Payment to VERIFIED with source PROVIDER only when exact evidence matches.

This serializes provider verification with manual verify and reject. Whichever path first establishes Payment VERIFIED owns the verification source. A later path cannot overwrite MANUAL with PROVIDER or PROVIDER with MANUAL. If rejection wins first, provider evidence may be retained but cannot reclassify the Payment.

## Exact matching and idempotency

Provider VERIFIED evidence must match provider, amount, and currency exactly. Supplied normalized payer phone and provider reference evidence must also match. There is no tolerance, partial match, currency conversion, or cross-provider query.

The command requires a visible-ASCII, case-sensitive, 1–128-character Idempotency-Key unique per Merchant. Its lowercase SHA-256 covers Payment ID and every immutable attempt snapshot. Exact replay returns the same attempt and never invokes the adapter twice. Reuse for another Payment or changed snapshot conflicts; another Merchant may reuse the key.

## Routes, permissions, and privacy

`POST /api/v1/merchants/:merchantId/orders/:orderId/payments/:paymentId/provider-verify` requires exact `payments.manage`, an Idempotency-Key, and no caller-controlled provider facts. CASH and missing provider references return 422.

`GET /api/v1/merchants/:merchantId/orders/:orderId/payments/:paymentId/verification-attempts` requires exact `payments.read`. It supports status, page, and pageSize, orders by creation/ID descending, and returns bounded evidence only. Snapshot phone/amount/currency/reference, idempotency keys, and request hashes are not returned. Payment detail exposes verificationSource, while attempt history is not embedded automatically.

Payment permissions remain independent from each other and from Order permissions. All targets are scoped by Merchant, Order, and Payment, with a composite database foreign key preventing cross-Merchant attempts.

## Financial and operational independence

Only VERIFIED PaymentTransactions contribute to the existing derived Order payment summary; MANUAL and PROVIDER contribute equally and are never double-counted. Provider attempts do not change Order status, StockHolds, InventoryBalance, InventoryLedgerEntry, or cancellation behavior. Cancellation retains provider-verified history and performs no automatic refund.

## Deferred B7.3 boundary

B7.2 adds no MTN/Airtel credentials, URLs, HTTP clients, live adapters, webhooks/callbacks, signatures, scheduler, polling, retry queue, settlement, reconciliation, provider/merchant payouts, refund execution, COD settlement, delivery, fulfilment, receipts, worker processing, audit, or outbox. Live provider adapters require a separately reviewed B7.3 stage.
