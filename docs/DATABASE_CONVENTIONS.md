# Database Conventions

## Authority and tooling

PostgreSQL is Tteeka's authoritative persistent storage. Prisma is the application ORM. The Prisma schema is `prisma/schema.prisma`, CLI configuration is `prisma.config.ts`, and reviewed migrations belong under `prisma/migrations`.

The generated Prisma Client lives at `packages/database/src/generated/prisma`. It is ignored by Git and must be reproduced with `npm run prisma:generate` after installation and whenever the schema changes. Root typecheck, test, and build commands generate it automatically; none of those commands mutate the database.

## Client and connection lifecycle

`@tteeka/database` owns the authoritative Prisma Client factory and PostgreSQL adapter construction. It accepts the already validated database URL from `@tteeka/config`; application code must not duplicate environment parsing or log connection credentials.

Each long-running API or worker process owns one Prisma Client and its adapter-managed PostgreSQL pool. Clients must never be created per request, controller, repository method, or job. The owning process disconnects its client during shutdown. Prisma connects lazily, so construction does not make API startup depend on immediate PostgreSQL availability.

Prisma does not replace infrastructure readiness checks. The direct B0.3 PostgreSQL probe remains responsible for readiness, preserving process-only liveness during a database outage.

## Migration workflow

For development:

1. Modify `prisma/schema.prisma` for an approved, genuine model change.
2. Run `npm run prisma:format`.
3. Run `npm run prisma:validate`.
4. Run `npm run prisma:migrate:dev` locally to create and apply the migration. This command uses a temporary shadow database and requires suitable local PostgreSQL privileges.
5. Review every generated `migration.sql` statement.
6. Run `npm run prisma:generate` explicitly.
7. Run the repository validation suite.
8. Commit the schema, reviewed migration SQL, and any Prisma configuration change together.

For staging and production, never use `migrate dev` and never create migrations. Apply reviewed, source-controlled migrations with `npm run prisma:migrate:deploy`. Deployments must apply required migrations before incompatible application changes go live. Do not make manual production schema changes, and never casually edit a migration that has already been applied.

B0.4 has no application models and intentionally has no migration. A fake table or marker migration must not be introduced merely to initialize migration history.

With this empty migration history, Prisma 7.9.1 reports `No migration found in prisma/migrations` and `The current database is not managed by Prisma Migrate` from `prisma migrate status`, then exits with status 1. This is the expected B0.4 result, not a reason to manufacture a migration. `prisma migrate deploy` reports no migration and no pending migrations, then exits successfully.

## Query and model policy

Database naming conventions will be defined before domain models are introduced. Prefer Prisma's typed query API for application work. Raw SQL requires a concrete need, parameter binding, review, and tests; B0.4's static `SELECT 1` smoke query is infrastructure-only and does not modify data.

Transaction boundaries will be expanded when business modules arrive. Migrations are always source-controlled.
