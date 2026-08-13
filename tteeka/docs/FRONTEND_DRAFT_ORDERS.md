# F7.1 Draft Orders

The frontend uses the exact B6.1 eight-route Draft Order contract. Existing Orders render frozen Customer, Delivery Location, Product, Variant, and selling-price snapshots; current F6/F4 records are used only for eligible selectors and never overwrite history.

`orders.read` controls navigation and reading. `orders.manage` controls commands and never implies read. Selector browsing additionally requires exact `customers.read` and `catalogue.read` in the frontend, although backend Order commands can validate known IDs with `orders.manage` alone. In live mode the current Catalogue contract supports exact merchant-wide SKU/barcode lookup (plus Product detail), not an all-Variant browse endpoint; the picker therefore exposes that exact lookup and validates active Product, active Variant, and current price before adding.

Items use complete desired-state `PUT`, unique Variant IDs, positive decimal-string quantities, a 100-line maximum, one currency, and BigInt-safe arithmetic.

## F7.2 confirmation and reservation

Confirmation calls the exact Order command with an absolute future `expiresAt` and one stable `Idempotency-Key` per logical attempt. The backend reserves every Order line atomically through Order-owned StockHolds. It never changes physical Inventory or appends Inventory ledger movements.

Order status and reservation status remain separate: a CONFIRMED Order remains confirmed after its Holds expire. Confirmed cancellation releases active Holds and finalizes due Holds as expired, while generic Hold controls cannot mutate Order-owned Holds. Confirmation requires `orders.manage`, not Inventory permissions, and introduces no Payment, Fulfilment, Delivery, fee, or stock-consumption behavior.

## F8.1 payment transactions

An Order may have multiple Cash, MTN MoMo, and Airtel Money PaymentTransactions. Only VERIFIED transactions contribute to the authoritative payment summary; Reported, Verification Pending, Rejected, Failed, Reversed, and Refunded transactions contribute zero under B7.1. Manual verification is a Merchant decision and does not claim provider verification.

Payments remain independent from Order status, reservation state, physical Inventory, ledger history, and Delivery. Cash is not synonymous with COD. F8.1 includes no screenshots, provider verification/attempts, MTN collection prompts, refund commands, settlement, or reconciliation.
# F8.2 provider verification attempts

Payment verification provenance is either `MANUAL` or `PROVIDER` and is displayed only when the API returns it. Manual verification remains the F8.1 command. Provider checks are a separate, explicitly confirmed action for `REPORTED` or `VERIFICATION_PENDING` Mobile Money Payments that have a transaction reference; Cash is never eligible. Both verification sources contribute equally to the verified-only Payment Summary.

The frontend calls only Tteeka's empty-body `provider-verify` command and paginated `verification-attempts` history APIs. It never calls MTN or Airtel directly and contains no provider credentials or settings. Attempt states are `PENDING`, `VERIFIED`, `NOT_VERIFIED`, and `FAILED`. An Attempt is evidence, not Payment status: `NOT_VERIFIED` does not reject a Payment, and `FAILED` does not fail it. History renders only the bounded serializer fields and never exposes request snapshots, idempotency metadata, hashes, secrets, headers, or raw provider payloads.

Production currently uses an empty provider registry. A check therefore returns the safe unavailable response while recording one completed FAILED Attempt; the frontend refreshes authoritative Payment, summary, and history state after that response. Mock mode is deterministic by transaction-reference fixture prefix and covers verified, not-verified, technical-failure, unavailable, replay, conflict, and manual/provider race semantics. This work adds no live MTN/Airtel integration, Collections/RequestToPay UI, polling, callbacks, reconciliation, settlement, refunds, COD, delivery, or fulfilment.

# F9 Delivery Jobs and Delivery Attempts

Delivery Jobs are operational records independent from Order, Payment, StockHold, and Inventory state. At most one Delivery may be created for a CONFIRMED Order with a complete frozen delivery snapshot. Creation accepts only `orderId`; the Delivery copies recipient and location snapshots from the Order and never follows later Customer or DeliveryLocation edits.

The exact lifecycle is PENDING to READY, READY to DISPATCHED, and DISPATCHED to DELIVERED or FAILED through an immutable Delivery Attempt. PENDING or READY may instead be CANCELLED. Attempt results are DELIVERED or FAILED; failed Attempts require one structured backend failure reason and both results support a trimmed optional 500-character note. Attempt time and number are server-generated. Delivered Delivery state does not fulfil the Order or consume stock.

The frontend adds no Rider or assignment, zone or fee, scheduling, COD, proof of delivery, returns, receipts, fulfilment, or inventory movement. Creating by selector uses the existing confirmed-Orders list only when the user separately has `orders.read`; users with Delivery permissions and a known Order ID retain the backend's independent authorization semantics.
