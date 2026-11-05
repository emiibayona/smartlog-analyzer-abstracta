# Log aggregation

With the app running, count logs grouped by microservice and level:

```sh
docker compose exec -T api npm run aggregate
```

To restrict the date range, service, or level:

```sh
docker compose exec -T api npm run aggregate -- --from 2026-11-04 --to 2026-11-04 --microservice inventory-service --level error
```

| Flag | Meaning |
| --- | --- |
| `--from YYYY-MM-DD` | Include logs from this UTC day at midnight |
| `--to YYYY-MM-DD` | Include logs through this UTC day, excluding the next midnight |
| `--microservice NAME` | Exact service name |
| `--level info\|warn\|error` | Exact level |
| `--help` | Print usage without connecting to MongoDB |

Bounds are optional; omitting one leaves that side open. Equal bounds select one
complete UTC day. Invalid dates, reversed ranges, unknown/repeated flags, and
invalid levels fail with a nonzero exit code before querying the database.

The 24 example seeds produce 12 groups: each of the four services has 3 info,
1 warn, and 2 error logs. The filtered command above returns:

```json
{
  "totalLogs": 2,
  "groups": [
    { "microservice": "inventory-service", "level": "error", "count": 2 }
  ]
}
```

This is a real MongoDB aggregation pipeline: `$match` → `$group` → `$project` →
`$sort`. Output is ordered by microservice and then level; empty matches return
`{ "totalLogs": 0, "groups": [] }`. Existing/additional data changes the counts.
There are no writes, migrations, seeds, or AI calls in this command.

`QUERY_TIMEOUT_MS` sets the server/client query deadline (default 5000, maximum
60000). Connection selection is bounded at 10 seconds. Credentials and raw log
content are never printed in errors. Local execution is `npm run aggregate -- ...`
with an accessible MongoDB configured through `MONGODB_URI` in `.env`.
