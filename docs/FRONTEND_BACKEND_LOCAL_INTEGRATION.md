# Frontend/backend local integration

## Current stage

INT0.1 connects the copied Next.js frontend at `D:\Tteeka\tteeka` directly to the NestJS API for authentication and Merchant-context bootstrap. INT0.1A adds an explicit, development-only command that provisions one normal local identity through the existing identity and RBAC tables. Catalogue, Inventory, Customers, Orders, Payments, and Deliveries remain outside the integration scope of this stage. Mock mode remains available only when selected explicitly; live failures never fall back to mock data.

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

After running the development provisioning command below, also set the returned Merchant UUID:

```dotenv
NEXT_PUBLIC_TTEEKA_MERCHANT_ID=<local-merchant-uuid>
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

The live flow is:

1. `POST /api/v1/auth/login`
2. `GET /api/v1/auth/me` during session bootstrap and refresh
3. `GET /api/v1/merchants/:merchantId/context`
4. `POST /api/v1/auth/logout`

The frontend projects the backend's exact permission keys into its navigation permission model. HTTP 401 clears authenticated UI state and returns to sign-in. HTTP 403 remains a workspace permission/access state. Network failures render a bounded connection error. None of these cases substitutes a mock user, Merchant, or permissions.

The provisioned identity authenticates through the normal `POST /api/v1/auth/login` service without a development branch. Set its returned Merchant UUID in the ignored frontend environment, sign in with the locally supplied phone/password without recording the password, refresh `/app`, and use normal **Sign out** to revoke the current Session. A subsequent unauthenticated `/auth/me` returns 401.

## Verified INT0.1 boundary

Verified locally: guarded and idempotent provisioning, normal password verification, infrastructure health, 14 applied migrations, API health, exact credentialed CORS, real browser login, issued-cookie contract, authenticated `/auth/me`, PostgreSQL-backed Merchant context with 21 permissions, permission-driven navigation, hard-refresh persistence, a real `customers.read` 403 with permission restoration, logout revocation, post-logout 401, login again with a new Session, authenticated API-outage UI, authenticated recovery, no mock fallback, frontend regressions/build, and backend Auth/authorization regressions/build.
