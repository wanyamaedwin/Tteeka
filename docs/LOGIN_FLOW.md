# Login Flow

## Purpose and endpoint

B1.5 introduced Tteeka's first authentication command: `POST /api/v1/auth/login`. It accepts only a JSON `phone` and `password`, validates both with Zod, authenticates the global User, creates a fresh opaque Session, and returns HTTP 200 with safe User and expiry information. B1.6 can now resolve that cookie on explicitly protected routes, starting with `GET /api/v1/auth/me`; logout, rate limiting, and authorization remain deferred.

## Phone identity and validation

Login accepts common Uganda phone forms such as `0772123456`, `256772123456`, and `+256772123456`, including ordinary spaces, hyphens, and parentheses. A pure local normalizer removes only those presentation separators, validates a nine-digit national number beginning with 7, and produces canonical `+256...` E.164 for the unique `User.phoneE164` lookup. It performs no network or operator-prefix validation and supports no email login.

The body must contain exactly a non-empty string phone of at most 64 characters and a password from 1 through 1024 characters. Passwords are never trimmed and no password-strength policy is applied during login. Malformed input receives HTTP 400.

## Authentication and enumeration resistance

The Auth service asks its narrow persistence store only for User ID, display name, status, and the minimal PasswordCredential fields. It fetches no Membership, Role, Permission, existing Session, or business data. Password verification uses `@tteeka/security`, never Argon2 directly from application code.

Unknown phone, missing PasswordCredential, incorrect password, and DISABLED User all return HTTP 401 with `Invalid phone number or password.` and the same public response shape. Missing-user and missing-credential paths perform one Argon2 verification against a synthetic dummy hash generated once at module startup and reused only in memory. This reduces an obvious computational timing difference without promising nanosecond equality.

Only an ACTIVE User may receive a new Session. MerchantMembership is deliberately not required: login and B1.6 request resolution authenticate the global User, while Merchant selection and authorization belong to later work. A User with zero Memberships can log in and call `/me` successfully.

## Password parameter upgrades

After successful verification, `passwordNeedsRehash` detects an outdated Argon2 parameter set. The same plaintext is rehashed using current Tteeka parameters and only `passwordHash` is updated. `passwordChangedAt` remains unchanged because an algorithm/parameter upgrade is not a user password change. Failed verification never upgrades a hash.

## Session issuance and lifetime

Every successful login calls `createSessionToken()` and creates a new Session; client-provided Session IDs and existing Sessions are never reused or revoked. Multiple successful logins therefore create distinct unrevoked rows. `SESSION_TTL_SECONDS` configures the single initial staff-web lifetime from 300 seconds through 30 days and defaults to 43,200 seconds (12 hours).

One `issuedAt` instant determines `expiresAt = issuedAt + SESSION_TTL_SECONDS`. The exact same Date drives the required database `expiresAt` and cookie expiry. PostgreSQL stores only `tokenHash`; the raw opaque token exists transiently until cookie serialization and is never logged, returned in JSON, or persisted.

## Cookie and response security

The raw token is delivered only in `tteeka_session` with:

- `HttpOnly=true`
- `SameSite=Lax`
- `Path=/api/v1`
- no explicit `Domain`
- `Secure=false` in development/test and `Secure=true` in staging/production, derived only from validated `NODE_ENV`
- `Expires` equal to the persisted Session expiry

The successful JSON body contains only `user.id`, `user.displayName`, and `session.expiresAt`. It never contains a token, token hash, password material, Session database ID, phone, email, Merchant, Membership, Role, or Permission. Successful responses set `Cache-Control: no-store` and `Pragma: no-cache`.

The framework-resolved client IP is stored only when it fits 45 characters. `X-Forwarded-For` is not manually trusted and no proxy policy is introduced. User-Agent is optional and truncated to 512 characters rather than rejecting login. Both values are diagnostic metadata, not authentication factors.

## Explicitly deferred

B1.6 adds route-scoped authenticated Session lookup and `/me` without changing login issuance. It does not implement logout, logout-all, Session listing/revocation, global authentication, authorization guards, renewal, rotation, sliding expiry, registration, invitations, email login, password reset/change APIs, OTP, MFA, passkeys, rate limiting, brute-force protection, account lockout, audit/outbox, Redis Session storage, or Merchant/Role/Permission resolution. See [AUTHENTICATED_REQUESTS.md](AUTHENTICATED_REQUESTS.md).
