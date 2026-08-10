# Authenticated Requests

## Purpose and boundary

B1.6 resolves the opaque `tteeka_session` cookie for explicitly protected HTTP routes. It establishes only global User authentication. B1.7 reuses that route-scoped guard for `POST /api/v1/auth/logout-all`; successful bulk revocation makes the current and every other old Session cookie for that User unusable. B1.8 composes the same guard before `MerchantContextGuard` on the explicit Merchant-context route. Session listing/management and a global authentication policy remain deferred.

PostgreSQL remains the sole Session authority. Redis is not consulted for authentication and stores no Session state.

## Resolution flow

The Express adapter uses the standard unsigned `cookie-parser` middleware. No cookie signing secret, Session secret, JWT secret, custom Cookie-header splitting, bearer token, or JWT is involved.

For `GET /api/v1/auth/me`, the route-scoped `SessionAuthGuard`:

1. reads the centralized `tteeka_session` cookie name;
2. rejects missing, empty, oversized, or malformed values before persistence access;
3. requires the B1.4 structure: 43 unpadded base64url characters decoding to exactly 32 bytes;
4. hashes a structurally valid raw token through `@tteeka/security`'s `hashSessionToken()`;
5. asks the narrow Auth store for the Session by `tokenHash`;
6. requires an existing, unrevoked Session whose `expiresAt` is strictly later than server time and whose User is `ACTIVE`;
7. attaches a safe `AuthenticatedPrincipal` to `request.auth`; and
8. permits the controller to return the already-resolved identity.

The lookup selects only Session ID, User ID, expiry, revocation, last-used time, and the related User's ID, display name, and status. It does not select PasswordCredential, phone, email, Membership, Merchant, Role, Permission, or other Sessions. The raw token and its hash are never attached to request context, persisted again, returned, or logged.

## Failure semantics

Missing, empty, malformed, unknown, revoked, expired, exact-expiry-boundary, and DISABLED-User Sessions all receive the same public HTTP 401 `Unauthorized.` response. A Session is expired when `expiresAt <= now`; only `expiresAt > now` is usable. Invalid token structure never reaches PostgreSQL.

An unexpected PostgreSQL or infrastructure failure is not an authentication decision and is not converted to HTTP 401. It follows the application's 500-class error handling without exposing raw database details. Revoked and expired Session rows remain persisted as history, and a DISABLED User's Sessions are neither deleted nor automatically revoked.

## Request context and `/me`

The internal context is deliberately small:

```ts
type AuthenticatedPrincipal = {
  user: { id: string; displayName: string };
  session: { id: string; expiresAt: Date };
};
```

`SessionAuthGuard` writes it only to `request.auth`. The focused `@CurrentAuth()` parameter decorator reads that established context and performs no hashing, lookup, or authorization.

For `GET /api/v1/merchants/:merchantId/context`, successful authentication runs before Merchant resolution. `MerchantContextGuard` writes its result only to `request.merchantContext`; it never mutates `AuthenticatedPrincipal`. `@CurrentMerchantContext()` reads that separate context. This preserves global identity independently of the requested tenant and allows the same Session to resolve different Merchants on separate requests.

`GET /api/v1/auth/me` returns only:

```json
{
  "user": { "id": "<uuid>", "displayName": "<display name>" },
  "session": { "expiresAt": "<ISO timestamp>" }
}
```

The response excludes the Session database ID, raw token, token hash, contact details, credential data, and all Merchant or authorization context. It sets `Cache-Control: no-store` and `Pragma: no-cache` and emits no `Set-Cookie` header.

## Last-used metadata

`SESSION_TOUCH_INTERVAL_SECONDS` defaults to 300 seconds and accepts integers from 60 through 3600. After authoritative authentication, a Session whose `lastUsedAt` is at least one interval old receives a best-effort conditional update:

```text
UPDATE sessions
SET last_used_at = now
WHERE id = sessionId
  AND last_used_at <= threshold
```

The conditional update limits redundant concurrent writes. A recent Session is not touched. Touch input uses the Session ID, threshold, and server time—not the raw token or token hash. A touch failure is logged without secrets and does not turn a valid principal into a false 401.

Touching changes only operational `lastUsedAt`. It never extends absolute `expiresAt`, changes `revokedAt` or `tokenHash`, creates another Session, rotates the token, renews the cookie, or implements sliding expiration.

## Route policy and deferred security

`GET /api/v1/auth/me` and `POST /api/v1/auth/logout-all` are explicitly guarded. Login and both health endpoints remain public. Current-session `POST /api/v1/auth/logout` is intentionally a special unguarded, idempotent route so missing, malformed, stale, expired, revoked, unknown, and DISABLED-User cookies can be cleared safely. Successful server revocation makes an old cookie fail future authenticated resolution. `SessionAuthGuard` is not an `APP_GUARD`, and no `@Public` mechanism is introduced.

Authentication and authorization remain separate: neither logout operation resolves Merchant context, Membership, Role, or Permission. B1.8 resolves Merchant context only on its explicit route and adds no global guard or Permission enforcement. Session listing/management, global authentication, renewal, rotation, sliding expiration, Redis Session storage, rate limiting, and audit/outbox remain deferred. A reviewed CSRF policy is required before production authenticated business write endpoints are introduced. See [SESSION_REVOCATION.md](SESSION_REVOCATION.md) and [MERCHANT_CONTEXT.md](MERCHANT_CONTEXT.md).
