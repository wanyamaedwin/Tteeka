# Tteeka frontend API architecture

The NestJS REST API is Tteeka's authoritative business system. The Next.js frontend owns presentation and transport composition only; it does not recreate permission enforcement, tenant isolation, catalogue rules, pricing rules, inventory arithmetic, or idempotency.

## Transport

`NEXT_PUBLIC_TTEEKA_API_BASE_URL` is the only API base URL configuration. `lib/api/client.ts` exposes `apiRequest<T>()`, which supports all HTTP methods, JSON bodies, query parameters, headers, `AbortSignal`, `credentials: 'include'`, `cache: 'no-store'`, JSON responses, and empty responses. Screens remain on isolated mock data in F0.2 and must never silently fall back to mocks after a real API failure.

The request shape is ready for opaque HttpOnly Session cookies. No token is exposed to JavaScript and no localStorage/sessionStorage token storage is used. CORS and cookie-domain topology remain deployment concerns for the authentication checkpoint.

## Errors and parsing

`ApiError` normalizes HTTP errors while preserving status, safe public message, optional code, field errors, and request context. Default messages cover 400, 401, 403, 404, 409, 422, 429, and 500+. Network failures are distinct from HTTP errors and use a connection message. Response parsing accepts JSON and empty bodies and raises a controlled error for malformed responses; raw stacks and backend dumps are not surfaced.

## Endpoints and query data

`lib/api/endpoints.ts` contains only current auth, merchant, staff, roles, catalogue, variant/pricing, and inventory paths. `toQueryString()` omits undefined values and safely serializes search, page, and pageSize. Shared pagination uses `page`, `pageSize`, `total`, and `totalPages`.

Money and inventory quantities are backend decimal strings such as `"65000"` and `"25"`. Infrastructure never converts them to JavaScript numbers or performs financial/inventory arithmetic. Feature-level display formatters may format them later without treating formatted output as authoritative.

## Async UI and roadmap

Future live screens should consistently represent loading, success, empty, and error states, with retry actions and field-level form errors. Feature API modules should be added close to each feature when screens become live. F1 authentication comes next; this checkpoint intentionally has no auth provider, login behavior, redirects, merchant context provider, database, Next.js commerce API, or unsupported future-domain endpoints.
