# Database migrations

Run migrations explicitly after starting MongoDB/API:

```sh
docker compose exec -T api npm run migrate
```

With an accessible MongoDB configured in `.env`, local execution is `npm run migrate`.
The API also runs pending versions before listening, so `docker compose up` remains
the only required application startup command.

`001-initial-collections` creates `logs`, `analyses`, and `rejected_logs` plus their
query indexes. Names match the existing Mongoose indexes so upgrading an existing
database preserves documents and additional indexes. Mongoose automatic collection
and index creation is disabled for application startup; migrations manage that DDL.

Successful versions are stored by ID and completion time in `schema_migrations`.
Versions run in ID order and are recorded only after every step succeeds. Reruns
skip recorded versions. MongoDB DDL and the history write are not one transaction:
a failure can leave partial structures, so every version must safely resume/repeat.
The initial migration tolerates existing collections and indexes.

Add new versions as `002-description.js`, exporting `{ id, up(db, options) }`, and
register them in `db/migrate.js`. Never edit an applied version or remove its history
to deploy changes. This runner is forward-only; no automatic rollback, collection
drops, document deletion, or index synchronization is performed. For destructive
future changes, plan a separate migration with an explicit recovery strategy.

Database operations have a 30-second client deadline. A failed migration makes
startup/CLI fail rather than letting the API run against a partially migrated DB.
