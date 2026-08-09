# Tteeka Backend

Tteeka is a Uganda-first WhatsApp Commerce Operating System. This repository currently contains only the B0.1 backend engineering foundation.

## Requirements

- Node.js 24 LTS
- npm

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
