# Architecture Decisions

## ADR-001: Modular monolith with a separate worker

- **Status:** Accepted
- **Decision:** Tteeka uses a modular monolith backend API with a separate worker process.
- **Rationale:** This establishes clear API and background-processing process boundaries while keeping backend code in one repository and avoiding premature service decomposition.

## ADR-002: npm workspace monorepo

- **Status:** Accepted
- **Decision:** Tteeka uses an npm workspace monorepo.
- **Rationale:** npm workspaces provide a minimal, native way to manage the API, worker, and shared backend packages together.

## ADR-003: Docker Compose for local data services

- **Status:** Accepted
- **Decision:** Tteeka uses Docker Compose to provide PostgreSQL and Redis for local development.
- **Rationale:** A two-service Compose environment gives backend developers consistent local data services with health checks and persistent volumes.
- **Scope:** This decision concerns local development infrastructure only. It does not define production deployment configuration.
