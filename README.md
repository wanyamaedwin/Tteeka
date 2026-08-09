# Tteeka Backend

Tteeka is a Uganda-first WhatsApp Commerce Operating System. This repository currently contains the backend foundation through B0.3.

## Requirements

- Node.js 24 LTS
- npm
- Docker Desktop or Docker Engine with Docker Compose

With a Node version manager, use the version declared in `.nvmrc` before installing dependencies.

## Repository layout

- `apps/api` — NestJS 11 API with operational health endpoints
- `apps/worker` — configuration-aware standalone TypeScript worker process
- `packages/config` — shared schema-validated application configuration
- `packages/testing` — placeholder for future shared testing utilities
- `docs` — current-state and architecture decision documentation

## Setup

```sh
npm install
```

## Local infrastructure

Create a local environment file in PowerShell:

```powershell
Copy-Item .env.example .env
```

Start PostgreSQL 18 and Redis 8, then check their status:

```sh
npm run infra:up
npm run infra:status
```

Stop the containers without deleting their persistent volumes:

```sh
npm run infra:down
```

The example configuration binds PostgreSQL to `127.0.0.1:5432` and Redis to `127.0.0.1:6379`. `POSTGRES_*` and `REDIS_PORT` configure the local Docker containers.

Application configuration is validated at startup:

- `NODE_ENV` selects `development`, `test`, `staging`, or `production`
- `API_PORT` selects the API listen port
- `DATABASE_URL` configures the PostgreSQL readiness probe
- `REDIS_URL` configures the Redis readiness probe
- `INFRA_HEALTH_TIMEOUT_MS` limits each infrastructure check

If local container ports differ from the defaults, update both the Docker port variables and the matching port in `DATABASE_URL` or `REDIS_URL` in the ignored `.env` file.

## Development

```sh
npm run dev:api
npm run dev:worker
```

The API listens on `API_PORT`, which defaults to `3000`. The worker validates the same shared configuration but does not process queues or jobs.

## Health endpoints

With the API running, these endpoints are available:

```text
GET /api/v1/health/live
GET /api/v1/health/ready
```

Liveness returns HTTP `200` whenever the API process is alive and does not depend on PostgreSQL or Redis. Readiness executes PostgreSQL `SELECT 1` and Redis `PING`; it returns HTTP `200` only when both checks pass, otherwise HTTP `503` with per-service `up` or `down` status.

## Validation

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Use `npm run format` to apply Prettier formatting.

See [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) for the exact implementation boundary.
