# Session Revocation

## Purpose and lifecycle contract

B1.7 adds explicit server-side Session revocation through `POST /api/v1/auth/logout` and `POST /api/v1/auth/logout-all`. Revocation is the one-way state transition `revokedAt: null -> timestamp`. It is not deletion: every affected Session row remains in PostgreSQL as security history, and conditional updates affect only rows whose `revokedAt` is null. A previously revoked row therefore keeps its first, authoritative revocation timestamp.

No automatic expired-Session cleanup or retention job exists. Session listing, device management, logout-other-sessions-only, administrator revocation, renewal, rotation, refresh tokens, and sliding expiration remain deferred.

## Current-session logout

`POST /api/v1/auth/logout` returns HTTP 204 with no body. It is deliberately not protected by `SessionAuthGuard`, allowing a browser to clear `tteeka_session` when the cookie is missing or malformed, the token is unknown, the Session is expired or already revoked, or the related User is DISABLED. These cases reveal no Session-existence or lifecycle distinction.

The service validates a supplied value with the existing `@tteeka/security` Session-token format validator. Missing and malformed values perform no hashing and no PostgreSQL operation. A structurally valid raw token is SHA-256 hashed with `hashSessionToken()` before the Auth store receives it; persistence never receives or logs the raw token. The store performs one conditional `updateMany` by `tokenHash` and `revokedAt: null`. Unknown and already-revoked hashes may update zero rows and still complete successfully. An expired but unrevoked Session is explicitly revoked.

Ordinary logout performs no User, Merchant, Membership, Role, or Permission lookup and does not authenticate or touch `lastUsedAt`. If persistence fails for a structurally valid token, the failure follows existing 500-class handling: the route does not claim success and does not clear the cookie, so the client can retry.

## Logout-all

`POST /api/v1/auth/logout-all` returns HTTP 204 with no body and is route-protected by `SessionAuthGuard`. It takes the global User ID only from the trusted `AuthenticatedPrincipal` attached to `request.auth`; no request body, query, header, Merchant, Membership, Role, or Permission supplies identity.

The service creates one server timestamp and passes it with `auth.user.id` to one Auth-store `updateMany`. Every Session for that User with `revokedAt: null` is revoked with that logical timestamp, including the current Session, other browser/device Sessions, and expired-but-unrevoked rows. Already-revoked rows keep their first timestamps, other Users are untouched, and no count is exposed. An ACTIVE User with zero MerchantMemberships can use logout-all normally.

The existing guard may make its B1.6 best-effort `lastUsedAt` touch before revocation. The bulk revocation then becomes authoritative. A persistence failure propagates and prevents cookie clearing.

## Cookie removal and response policy

Both successful routes use Express's native `clearCookie` after any required persistence work succeeds. Issuance and clearing share the same cookie identity and policy:

- name `tteeka_session`
- `Path=/api/v1`
- `HttpOnly=true`
- `SameSite=Lax`
- no explicit `Domain`, preserving host-only scope
- `Secure=false` in development/test and `Secure=true` in staging/production

The clear operation supplies no custom `expires` or `maxAge`; Express supplies removal expiry semantics. Logout does not issue a replacement cookie or token, create a Session, rotate a token, renew expiry, or implement sliding expiration. Both successful responses set `Cache-Control: no-store` and `Pragma: no-cache`.

## Authority and deferred hardening

PostgreSQL remains the only Session authority. Redis stores no Session or revocation state. Logout is global User authentication/session management and remains independent of merchant authorization.

Both endpoints use POST and retain the existing SameSite=Lax boundary. B1.7 does not claim full CSRF protection; a broader reviewed CSRF policy remains required before production authenticated business writes. Authorization, Session listing/management, cleanup/retention, audit/outbox, and administrator workflows also remain deferred.
