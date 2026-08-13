# Frontend/backend local integration

## Current stage

INT0.1C adds production new-merchant registration and initial workspace creation to the frozen INT0.1 live authentication integration. A person can create a normal User, password credential, Merchant, Membership, and explicitly permissioned Owner Role without development provisioning or manual database work. An authenticated User with no ACTIVE Membership can create the same initial workspace without creating a second identity. Catalogue, Inventory, Customers, Orders, Payments, Deliveries, and Profile/Settings live integration remain outside this stage. Mock mode remains explicitly selectable; live failures never fall back to mock data.

## Runtime and ports

Use Node.js 24.14.0 for the backend gates and runtime.

From `D:\Tteeka`, start the existing infrastructure:

```powershell
npm run infra:up
```

PostgreSQL listens on `127.0.0.1:15432` and Redis listens on `127.0.0.1:16379` in the current local `.env`. Build and start the API on port 3000:

```powershell
npm run build --workspace @tteeka/api
npm run start --workspace @tteeka/api
```

The API routes include the `/api/v1` prefix in their controller paths. Verify runtime health with:

```powershell
curl.exe http://localhost:3000/api/v1/health/live
curl.exe http://localhost:3000/api/v1/health/ready
```

From `D:\Tteeka\tteeka`, start the frontend on port 3001:

```powershell
node node_modules/next/dist/bin/next dev -p 3001
```

The frontend currently uses pnpm and its own `pnpm-lock.yaml`. The backend uses npm and the root `package-lock.json`. Do not merge or regenerate these lockfiles for INT0.1.

## Repository quality-gate boundary

The root npm workspaces contain the backend applications and shared packages, and root `npm run lint` covers that npm workspace boundary. The copied frontend remains a separate pnpm package under `D:\Tteeka\tteeka`, with its own TypeScript, test, and Next.js production-build gates.

Root ESLint excludes the separate frontend package, including generated `tteeka/.next` output, instead of imposing the backend's typed ESLint policy on it. Git ignore rules keep only generated or local frontend artifacts such as `.next`, dependencies, local environment files, coverage, TypeScript build metadata, and temporary logs out of source visibility. Frontend application, component, library, test, configuration, and documentation files remain visible for eventual review and commit.

## Local live configuration

The ignored frontend file `D:\Tteeka\tteeka\.env.local` contains:

```dotenv
NEXT_PUBLIC_TTEEKA_APP_MODE=live
NEXT_PUBLIC_TTEEKA_API_BASE_URL=http://localhost:3000/api/v1
```

The ignored backend `.env` sets this exact allowed browser origin:

```dotenv
FRONTEND_ORIGIN=http://localhost:3001
```

The browser calls the NestJS API directly. Nest CORS permits only the configured origin and enables credentialed requests. The centralized frontend API client uses `credentials: "include"` and `cache: "no-store"` for every request.

## Explicit development identity provisioning

Provisioning never runs during API or worker startup, tests, builds, migrations, or CI. It runs only when explicitly invoked and refuses to run unless both safeguards are present:

```dotenv
NODE_ENV=development
TTEEKA_DEV_PROVISION_AUTH_CONFIRM=local-only
```

Configure these additional values only in the ignored backend `.env`:

```dotenv
TTEEKA_DEV_AUTH_MERCHANT_NAME=<local-merchant-display-name>
TTEEKA_DEV_AUTH_USER_NAME=<local-user-display-name>
TTEEKA_DEV_AUTH_PHONE=<supported-Uganda-phone>
TTEEKA_DEV_AUTH_PASSWORD=<local-password>
TTEEKA_DEV_AUTH_ROLE_NAME=<local-role-name>
```

Never copy the real password into source, tests, documentation, command output, or `.env.example`. With PostgreSQL available and migrations current, run from `D:\Tteeka`:

```powershell
npm run dev:provision-auth
```

The command uses the production Uganda phone normalizer, production `@tteeka/security` Argon2id hasher, normal ACTIVE lifecycle states, database UUIDv7 defaults, and the existing code-owned permission sync. It assigns all current ACTIVE code-owned permissions to the configured local Role through normal `RolePermission` rows; it does not create a wildcard, superuser flag, or role-name bypass.

The command is desired-state and safely repeatable. Re-running the same configuration resolves the same Merchant, User, Membership, and Role, replaces the Role's permission assignments with the current ACTIVE catalogue, keeps one MembershipRole assignment, and explicitly re-hashes/replaces the PasswordCredential with the currently supplied local password. Password replacement happens only when this command is run.

Safe command output is limited to record IDs, display names, normalized phone, Role name, and permission count. It never emits the password, credential hash, session token, or cookie value.

## Authentication and Merchant context

Authentication uses an opaque server Session in the `tteeka_session` cookie. The cookie is HttpOnly, SameSite=Lax, not Secure in local development, and scoped to `/api/v1`. Frontend JavaScript does not read or store the token.

The existing-workspace live flow is:

1. `POST /api/v1/auth/login`
2. `GET /api/v1/auth/me` during session bootstrap and refresh
3. `GET /api/v1/onboarding/workspace-status`
4. `GET /api/v1/merchants/:merchantId/context`
5. `POST /api/v1/auth/logout`

The frontend projects the backend's exact permission keys into its navigation permission model. HTTP 401 clears authenticated UI state and returns to sign-in. HTTP 403 remains a workspace permission/access state. Network failures render a bounded connection error. None of these cases substitutes a mock user, Merchant, or permissions.

The provisioned identity authenticates through the normal `POST /api/v1/auth/login` service without a development branch. Merchant discovery now comes from the authenticated workspace-status response, so the frontend does not require a configured Merchant UUID. Sign in with the locally supplied phone/password without recording the password, refresh `/app`, and use normal **Sign out** to revoke the current Session. A subsequent unauthenticated `/auth/me` returns 401.

## Production merchant onboarding (INT0.1C)

Public registration is `POST /api/v1/onboarding/register`. Its strict request contains only `name`, `phone`, `password`, and `businessName`, plus a printable 1-128 character `Idempotency-Key` header. Names are trimmed and bounded by the existing 160-character User/Merchant fields, Uganda phone input uses the production normalizer, and registration passwords require at least 8 and at most 1024 characters. Phone ownership verification is deferred because no SMS/OTP backend exists; the UI does not claim that a phone or account is verified.

Registration hashes the password with the production `@tteeka/security` Argon2id helper before opening the business transaction. The transaction creates one ACTIVE User and PasswordCredential, an ACTIVE Merchant using the database-owned `UGX` and `Africa/Kampala` defaults, an ACTIVE Membership, an `Owner` Role, one MembershipRole, and RolePermission rows for all 21 current ACTIVE code-owned Permission keys. `Owner` has no name-based authorization meaning and receives no wildcard. Future Permission codes require the normal catalogue synchronization and explicit RolePermission assignment strategy.

The safe registration response contains only User, Merchant, and Membership identifiers plus the Merchant display name. Registration does not issue a token or Session. The frontend immediately calls the unchanged `POST /api/v1/auth/login`, receives the normal opaque HttpOnly cookie, refreshes `/auth/me`, resolves workspace status, and loads Merchant context. If automatic login fails after successful creation, the page states that the account was created and offers normal sign-in. Equivalent normalized phones return a bounded 409 without creating another graph.

Authenticated workspace discovery is `GET /api/v1/onboarding/workspace-status`. It returns `NO_WORKSPACE` only when the session User has zero ACTIVE Memberships; otherwise it returns one existing workspace for the current single-workspace product boundary. `/app` sends `NO_WORKSPACE` Users to `/onboarding/workspace`, while 401 remains sign-in and Merchant-context 403 remains an access state.

`POST /api/v1/onboarding/workspace` requires the normal Session and accepts only `businessName` plus `Idempotency-Key`. It derives User ID from the Session and creates the ordinary Merchant/Membership/Owner graph in one transaction. A per-User PostgreSQL advisory transaction lock serializes concurrent initial-workspace attempts. An existing ACTIVE Membership returns a bounded 409; multi-workspace creation is intentionally deferred.

Migration 15, `onboarding_idempotency_foundation`, adds the smallest command record needed for onboarding retries. Registration keys are public-command scoped; workspace keys are scoped to the authenticated User. The record stores a SHA-256 request fingerprint and safe result IDs, never the request body, password, credential hash, Session token, or cookie. Same key and same request replays the same result; same key and a different request returns 409. Registration additionally serializes normalized-phone creation, preserving the existing unique phone constraint.

For local live use, open `http://localhost:3001/login`, choose **Create account**, and let the browser call `http://localhost:3000/api/v1/onboarding/register`. The API and frontend URLs remain `http://localhost:3000/api/v1` and `http://localhost:3001`. Production onboarding has no dependency on `dev:provision-auth`; that command remains available only as the previously documented explicit local fixture tool.

## Live Merchant Profile and Settings (INT0.2A)

The existing F3.1 Business Profile and Business Settings pages now use the frozen B2.1 API directly in live mode:

```text
GET   /api/v1/merchants/:merchantId/profile
PATCH /api/v1/merchants/:merchantId/profile
GET   /api/v1/merchants/:merchantId/settings
PATCH /api/v1/merchants/:merchantId/settings
```

The Merchant ID always comes from authenticated workspace discovery and Merchant context. The pages use the centralized typed API client, which keeps `credentials: include` and `cache: no-store`; they contain no locally configured, provisioned, or browser-test Merchant ID. Profile exposes only `id`, `displayName`, `legalName`, `phone`, and `email`, with PATCH limited to the four mutable business fields. Settings exposes and patches only `currency` and `timezone`.

Authorization remains the exact B2.1 model: Profile GET requires `merchant.profile.read`, Profile PATCH requires `merchant.profile.manage`, Settings GET requires `merchant.settings.read`, and Settings PATCH requires `merchant.settings.manage`. Manage never implies read. Read-only users see authoritative values without edit actions; manage-only users receive a blank partial-update form without a preceding GET or disclosure of saved values; users with neither permission receive no resource request.

Live Profile and Settings reads are page-scoped, show resource-specific loading and bounded retry states, and never replace failures with mock fixtures. HTTP 401 returns to the frozen sign-in flow, HTTP 403 remains an access state, and network/save failures remain bounded. Explicit mock mode continues to use the existing F3.1 fixtures and in-memory updates.

Verified locally with a Merchant created through the real INT0.1C registration flow: the onboarding display name appeared through B2.1 Profile GET; a legal-name PATCH survived hard refresh and matched PostgreSQL; Settings GET returned the database-owned `UGX` and `Africa/Kampala` defaults; a temporary timezone PATCH survived refresh and was restored; an invalid phone PATCH showed a bounded frontend error and left storage unchanged; removing `merchant.profile.read` produced manage-only UI and a real API 403 while authentication remained valid; restoring it returned the Owner Role to all 21 active permissions. A controlled API outage produced a bounded save failure with no mock continuation, and recovery refetched the previously persisted Profile.

An authenticated User with no ACTIVE Membership still stops at `/onboarding/workspace`; Profile and Settings are not mounted and make no Merchant request in that state. Staff/Roles, Catalogue, Inventory, Customers, Orders, Payments, and Deliveries live integration remain outside INT0.2A.

## Live Staff and Roles (INT0.2B)

The existing F3.2 Staff and F3.3 Roles pages use the frozen B2.2 access-management API directly in live mode:

```text
GET   /api/v1/merchants/:merchantId/staff
POST  /api/v1/merchants/:merchantId/staff
PATCH /api/v1/merchants/:merchantId/staff/:membershipId
PUT   /api/v1/merchants/:merchantId/staff/:membershipId/roles
GET   /api/v1/merchants/:merchantId/roles
POST  /api/v1/merchants/:merchantId/roles
PATCH /api/v1/merchants/:merchantId/roles/:roleId
PUT   /api/v1/merchants/:merchantId/roles/:roleId/permissions
GET   /api/v1/merchants/:merchantId/permissions
```

The exact permissions are `merchant.staff.read`, `merchant.staff.manage`, `merchant.roles.read`, and `merchant.roles.manage`. Each is independent: manage does not imply read, and Membership Role replacement requires `merchant.roles.manage`, not `merchant.staff.manage`. Merchant IDs come only from authenticated workspace context. Page-scoped API calls use the centralized cookie client with `credentials: include`, `cache: no-store`, bounded loading/errors, frozen 401 sign-in handling, distinct 403 access states, and no live-to-mock fallback.

Staff creation accepts only a Uganda phone belonging to an existing ACTIVE global User and creates one ACTIVE MerchantMembership with no Roles. It does not create a User, PasswordCredential, password, or invitation, so a person without existing credentials cannot sign in merely because a Staff Membership was added. Duplicate ACTIVE or DISABLED Memberships return HTTP 409. Membership mutation supports only `ACTIVE`/`DISABLED`; no delete route exists. `PUT staff/:membershipId/roles` replaces the complete multiple-Role assignment set using ACTIVE same-Merchant Role IDs.

Roles are created from `name` and optional `description`, start ACTIVE with no permissions, and can update only `name`, `description`, or `status`. ACTIVE/DISABLED lifecycle retains authorization links and there is no Role delete route. `PUT roles/:roleId/permissions` sends the complete desired permission-key set. The editor gets assignable keys from the real permission catalogue, currently 21 ACTIVE code-owned entries; frontend metadata supplies friendly presentation only, and newly exposed keys remain present in the desired state. Effective authorization still comes from fresh Merchant context (`MembershipRole -> RolePermission -> Permission`), never Role names.

B2.2 has no Owner-name bypass, immutable-Owner rule, last-owner protection, or self-lockout prevention. The UI does not claim otherwise and mutable verification must use dedicated fictional local Staff and Roles. Context is explicitly refreshed after Role, RolePermission, MembershipRole, or Membership lifecycle writes; there is no polling. The authenticated zero-membership branch still stops at `/onboarding/workspace` before Staff, Role, or Permission-catalogue pages mount.

The INT0.2B local walkthrough used newly registered fictional Users and a dedicated non-Owner Role. It verified add-by-existing-phone, generic rejection of an unknown phone, duplicate-Role HTTP 409 handling, Staff ACTIVE/DISABLED/ACTIVE persistence, exact multiple-Role assignment persistence, the 21-entry live Permission catalogue, and exact desired-state permission replacement with one key added and one removed. A dedicated Staff session proved that `merchant.settings.manage` did not imply `merchant.settings.read` (PATCH 200, GET 403), then immediately observed the replacement read-only grants (Profile and Settings GET 200; both PATCH 403). Hard refreshes retained the Staff, Role, assignment, lifecycle, and permission state. With the API process deliberately unavailable, the mounted Staff page showed its bounded live error and Retry state without mock data; Retry recovered after restart. Staff and Roles both rendered without page-level horizontal overflow at a 401 px near-mobile viewport, and the verification tabs reported no browser warning/error logs. The original Owner membership, Owner Role status, single Owner assignment, and all 21 Owner permissions remained unchanged in the dedicated test Merchant.

INT0.2B leaves Staff invitations/account recovery, password administration, audit UI, Catalogue, Inventory, Customers, Orders, Payments, and Deliveries live integration pending. Explicit F3.2/F3.3 mock fixtures remain available only in mock mode.

## Verified INT0.1 boundary

INT0.1C uses 15 applied migrations and preserves the frozen session and authorization architecture. Production onboarding does not use development confirmation variables, does not create a special Session path, does not expose credentials or request fingerprints, and does not silently continue with mock data when a live request fails.
