# MTN MoMo Collections sandbox contract

## B7.3A scope and contract source

B7.3A adds a sandbox-only MTN MoMo Collections HTTP client and an explicit developer smoke command. It is a provider transport/contract checkpoint, not a merchant-facing collection workflow. The contract was re-checked on 2026-08-12 against the current official MTN MoMo Developer Portal Collection OpenAPI explorer, the official MoMo APIs Postman workspace, and the portal's Getting Started, Sandbox Use Cases, Common Error Codes, and Callback guidance. The implemented API version is Collections `v1_0`; the official Postman token example available during review was dated 2024-10-08.

Official sources:

- `https://momodeveloper.mtn.com/API-collections#api=collection`
- `https://www.postman.com/momoapis/momo-open-apis/documentation/lar51hz/momo-open-apis-sandbox`
- `https://momodeveloper.mtn.com/get-started`
- `https://momodeveloper.mtn.com/api-documentation/testing`
- `https://momodeveloper.mtn.com/api-documentation/common-error`
- `https://momodeveloper.mtn.com/api-documentation/callback`

## Proven sandbox wire contract

The sandbox base URL is fixed in code as `https://sandbox.momodeveloper.mtn.com`; neither a production URL nor a runtime base-URL toggle exists. The target environment is exactly `sandbox`, and provider-level sandbox requests use exactly `EUR`. This synthetic provider currency is never converted from, copied to, or written over a Tteeka Order or Payment currency.

`POST /collection/token/` uses HTTP Basic authentication over the sandbox API user UUID v4 and API key, plus the Collections `Ocp-Apim-Subscription-Key`. It has no request body. A valid JSON response contains `access_token`, `token_type`, and positive integer `expires_in` seconds.

`POST /collection/v1_0/requesttopay` uses Bearer authentication, `Ocp-Apim-Subscription-Key`, `X-Reference-Id`, `X-Target-Environment: sandbox`, and JSON content type. Its body contains the exact MTN fields `amount`, `currency`, `externalId`, `payer: { partyIdType: "MSISDN", partyId }`, `payerMessage`, and `payeeNote`. The messages/notes are limited to 160 characters, matching official error guidance. `X-Callback-Url` is optional in the OpenAPI operation; when configured it must be HTTPS and its host must match the sandbox API-user callback host. B7.3A sends the header but adds no callback route, controller, signature logic, or persistence.

The `X-Reference-Id` is a cryptographically generated UUID v4. The client requires the caller to supply it to `requestToPay`, making identity stable across recovery. A timeout or lost response never causes a new reference or an automatic second POST. B7.3B will persist this identity before provider I/O.

HTTP 202 means only that MTN accepted the asynchronous request for processing. It is normalized to `ACCEPTED`, never Payment verification or financial success. A definite HTTP rejection is `REJECTED`. Timeout, connection reset, or another ambiguous transport failure after submission is `UNKNOWN`, not rejected.

`GET /collection/v1_0/requesttopay/{referenceId}` uses the same Bearer, subscription-key, and target-environment headers. HTTP 200 only means the status response was retrieved. The official response status is exactly `PENDING`, `SUCCESSFUL`, or `FAILED`; the client preserves this vocabulary and returns bounded amount, currency, financial transaction ID, external ID, and reason code/message evidence. HTTP 404 becomes `NOT_FOUND`; transport, unavailable, malformed, and unexpected responses become `TECHNICAL_FAILURE`.

## Errors, tokens, and secrets

Errors are reduced to a bounded internal code, safe message, HTTP status, and bounded provider code. Mappings cover authentication, authorization, duplicate reference (`RESOURCE_ALREADY_EXIST`/409), not found, invalid target environment, invalid currency, unavailable provider, bad request, timeout, connection failure, and unexpected response. Provider response bodies, response headers, Authorization values, credentials, tokens, and subscription keys are never returned, persisted, or logged.

Access tokens exist only in process memory. A valid token is reused until a 30-second safety margin before expiry. Missing/near-expiry tokens refresh, and concurrent refresh callers share one in-flight request. There is no PostgreSQL, Redis, file, or distributed token storage.

## Configuration and default-disabled wiring

`MTN_MOMO_COLLECTIONS_ENABLED` defaults to `false`. Disabled application configuration needs no MTN credentials and performs no MTN network activity. Enabling requires a UUID-v4 `MTN_MOMO_COLLECTIONS_API_USER`, `MTN_MOMO_COLLECTIONS_API_KEY`, and `MTN_MOMO_COLLECTIONS_SUBSCRIPTION_KEY`. `MTN_MOMO_COLLECTIONS_CALLBACK_URL` is optional but HTTPS-only. `MTN_MOMO_COLLECTIONS_TIMEOUT_MS` is bounded from 100 through 30000 milliseconds and defaults to 10000.

Only variable names and empty/synthetic placeholders belong in `.env.example`, tests, and documentation. Real credentials remain local and ignored. The normal `PaymentModule` does not instantiate this client and continues binding the B7.2 `PROVIDER_VERIFICATION_REGISTRY` to `EmptyProviderVerificationRegistry`.

## Explicit smoke command

The developer-only command is not part of startup, build, CI, or automated tests:

```text
npm run mtn:sandbox:smoke -- token
npm run mtn:sandbox:smoke -- request-to-pay <sandboxMsisdn> <amount> <externalId> <payerMessage> <payeeNote> [referenceId]
npm run mtn:sandbox:smoke -- status <referenceId>
```

Request values may instead come from the tracked variable names `MTN_MOMO_SANDBOX_MSISDN`, `MTN_MOMO_SANDBOX_AMOUNT`, `MTN_MOMO_SANDBOX_EXTERNAL_ID`, `MTN_MOMO_SANDBOX_PAYER_MESSAGE`, `MTN_MOMO_SANDBOX_PAYEE_NOTE`, and optional `MTN_MOMO_SANDBOX_REFERENCE_ID`. They must be synthetic values from MTN's documented sandbox use cases, never a real customer number, Tteeka Order ID, or PaymentTransaction. The token command reports only type and expiry, never the token. Submission prints the stable reference so an explicit later status command can reuse it. There is no polling loop.

## Domain and future-stage boundary

B7.3A creates no database record and does not read Tteeka domain persistence. It cannot create, verify, reject, or fail a PaymentTransaction; create a PaymentVerificationAttempt; alter a payment summary; change an Order; or affect InventoryBalance, InventoryLedgerEntry, or StockHold. Customer-reported B7.2 provider references are not treated as MTN RequestToPay IDs.

No live Uganda traffic, production toggle, Airtel adapter, public route, Permission, Prisma change, callback receiver, worker, scheduler, retry queue, automatic polling, settlement, reconciliation, refund, transfer, disbursement, remittance, or account-balance feature is included. B7.3B owns persisted collection-request orchestration and recovery; production onboarding remains a later independently reviewed go-live stage.
