# F1 Authentication & Session UX

Tteeka authentication uses the backend session cookie as the only source of truth. The frontend never reads, writes, stores, decodes, or refreshes tokens; all auth requests use `credentials: 'include'` in `lib/api/client.ts`.

## Session bootstrap

`AuthProvider` calls `GET /auth/me` on mount. A 401 means unauthenticated and redirects from `/app` to `/login`; network, 403, 500, and other non-401 failures remain retryable and do not redirect.

## Login

`/login` submits `POST /auth/login` with phone and password, then updates the provider with the returned user and navigates to the requested protected path. Error copy is generic for authentication failures and specific only for network reachability.

## Scope

F1 deliberately excludes Merchant, permissions, database work, middleware authentication, OAuth, magic links, passkeys, and alternate auth providers. Feature pages continue using mock data until their corresponding API integration phases.
