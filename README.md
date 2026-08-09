# Tteeka Backend

Tteeka is a Uganda-first WhatsApp Commerce Operating System. This repository currently contains only the B0.1 backend engineering foundation.

## Requirements

- Node.js 24 LTS
- npm
- Docker Desktop or Docker Engine with Docker Compose

With a Node version manager, use the version declared in `.nvmrc` before installing dependencies.

## Repository layout

- `apps/api` — minimal NestJS 11 API process
- `apps/worker` — minimal standalone TypeScript worker process
- `packages/config` — placeholder for future shared configuration
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

The example configuration binds PostgreSQL to `127.0.0.1:5432` and Redis to `127.0.0.1:6379`. Change `POSTGRES_PORT` or `REDIS_PORT` in `.env` if either host port is already in use.

## Development

```sh
npm run dev:api
npm run dev:worker
```

The API listens on port `3000`. The worker currently prints a startup message; queue processing has not been implemented.

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
