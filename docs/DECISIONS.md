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

## ADR-004: Shared schema-validated environment configuration

- **Status:** Accepted
- **Decision:** Tteeka uses one shared schema-validated environment configuration package for the API and worker.
- **Rationale:** Central validation provides consistent types, readable fail-fast startup errors, and one authoritative definition of critical application configuration.

## ADR-005: Separate liveness and readiness semantics

- **Status:** Accepted
- **Decision:** API liveness does not depend on external infrastructure; API readiness depends on PostgreSQL and Redis availability.
- **Rationale:** An infrastructure outage should make the API not ready for normal traffic without incorrectly declaring that the API process itself is dead.

## ADR-006: Data clients are health-only in B0.3

- **Status:** Accepted
- **Decision:** The PostgreSQL and Redis clients introduced in B0.3 are used only by infrastructure readiness probes.
- **Rationale:** Real dependency probes verify operational availability without prematurely introducing business persistence, caching, queues, or repositories.
