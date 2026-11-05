# smartlog-analyzer-abstracta

Analyze logs from multiple microservices and generate insights.

## Docker setup

Use Docker Desktop with Linux containers on Windows (WSL 2) or macOS.
On Linux, use Docker Engine with the Docker Compose v2 plugin, or Docker Desktop.
The images support x86-64 and ARM64, including Intel and Apple Silicon Macs.
No host Node.js or MongoDB installation is required. Named volumes keep database
files inside Docker rather than in an OS-specific host directory.

### Application

The minimal Express API implements `GET /api`, returning HTTP 200 with plain text
`OK`. It listens on `0.0.0.0:3000` by default and supports `HOST` and `PORT`.
Database seeding and log retrieval are available; log ingestion and analysis are not implemented yet.
The API connects to `MONGODB_URI` before accepting requests and requires MongoDB
for startup. Local execution requires an accessible database configured in `.env`.

To start MongoDB alone:

```sh
docker compose up -d mongodb
```

### Start the full stack

Run from the repository root:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

Check the API at `http://localhost:3000/api`. `/api/health` returns
`{ "status": "ok" }` when MongoDB responds, or HTTP 503 when unavailable.
Docker readiness uses this live database check.

Optionally copy `.env.example` to `.env` using your editor and set `API_PORT` to
change the host port. Compose reads `.env` automatically. The database hostname
inside the Compose network is `mongodb`, not `localhost`.

This setup is for local development: the API is bound to host loopback, MongoDB
has no published host port, and database authentication is not configured.
Configure authentication and deployment secrets before deploying remotely.

### Stop and manage data

```sh
docker compose down
```

Stopping the stack preserves MongoDB data. To intentionally delete all stored
database data and remove the stack:

```sh
docker compose down --volumes
```

After application or dependency changes, run `docker compose up --build -d`.
Source code is copied into the image; this setup does not provide live reload.

## Local development and tests

### Retrieve logs

`GET /api/logs` returns `{ data, pagination: { page, limit, total, totalPages } }`.
Logs include a string `id` and are sorted by date descending, then ID descending.

| Query parameter | Behavior |
| --- | --- |
| `date` | Valid `YYYY-MM-DD` UTC calendar day |
| `microservice` | Exact name; at most 200 characters |
| `level` | `info`, `warn`, or `error` |
| `message` | Case-insensitive literal substring; at most 500 characters |
| `page` | Positive integer, default `1` |
| `limit` | Positive integer up to `100`, default `20` |

Filters combine with AND. Empty, repeated, unknown, or invalid parameters return
HTTP 400 with `{ "error": "..." }`. Unknown microservices and out-of-range pages
return HTTP 200 with empty data. No matches produce `totalPages: 0`.

Example: `http://localhost:3000/api/logs?microservice=inventory-service&level=error&page=1&limit=10`.
Counts and page data are separate reads, so concurrent writes may change totals.

### Retrieve analyses

`GET /api/analysis` (also `/api/analysis/`) uses the log listing response envelope,
pagination defaults/limits, and newest-first date/ID sorting. Supported filters
are `date`, `microservice`, `message`, and `status`. Dates are UTC calendar days;
message matching is a case-insensitive literal substring. Status must be exactly
`Pending`, `In progress`, or `Completed`. Empty or repeated parameters are invalid.

`GET /api/analysis/:id` returns one analysis directly, with a string `id` and no
MongoDB `_id` or `__v`. IDs must be 24 hexadecimal characters (case-insensitive).
Malformed IDs return 400; valid missing IDs return 404. Lookup accepts no query
parameters. Database timeouts return 503 and unexpected failures return generic 500.

Analyses use the `analyses` collection. Pending/in-progress records may omit
`result` and `message`. GET endpoints read saved records; they do not generate AI
analyses or populate the application database with synthetic analysis results.
Tests create temporary synthetic analyses only in the isolated test database.

### Running database integration and E2E tests

`npm test` runs unit and isolated HTTP tests. Run real database integration and
E2E tests through Docker (the test image includes development dependencies):

```sh
docker compose --profile test build api-test tests
docker compose --profile test run --rm tests
```

After application changes, rebuild both test images with the build command above.
Tests start a separate `api-test` and ephemeral `mongodb-test` on an internal
Docker network, without published ports or access to the application's data volume.
Database integration and E2E suites use Node's test runner to avoid a MongoDB
driver handshake issue in Jest's sandbox. Integration tests use the application
and MongoDB; E2E tests send HTTP requests
to the running test API container. Both insert uniquely named synthetic fixtures
and remove only their own IDs afterward. Seed tests use a temporary collection.
Existing seeded application logs remain untouched. Stop test services with
`docker compose --profile test stop api-test mongodb-test` when finished.
For tests outside Docker, supply `MONGODB_URI` and, for E2E, `API_BASE_URL`, then
run `npm run test:integration` or `npm run test:e2e`. The database name must end
in `_test`, and E2E must target an API using that same test database.

### Configuration and diagnostics

Startup validates MongoDB URI syntax, port (1–65535), CORS origin syntax, and
database deadlines. `QUERY_TIMEOUT_MS` defaults to 5000 (maximum 60000);
`HEALTH_TIMEOUT_MS` defaults to 2000 (maximum 10000). Queries have client and
server time limits; database timeouts return a generic JSON HTTP 503.
Indexes cover newest-first ordering and common microservice/level filters.
Literal substring message searches can still scan data; deadlines bound their work.

Requests receive a generated `X-Request-Id`. JSON logs include that ID, matched
route, method, status, and duration. Error logs record safe error names and codes,
including underlying cause codes, rather than raw error messages, request URLs,
headers, or payloads. Configuration and database credentials are never logged.

### Seed demo logs

Seed 24 synthetic warehouse logs (six per microservice), with successful actions,
warnings, repeated timeouts, and recovery. Fixed UTC timestamps on November 4,
2026 make the dataset repeatable. Stable MongoDB IDs prevent duplicates; reruns
insert missing demo logs without overwriting existing data. No collections are
cleared and seeding does not run automatically at startup.

```sh
docker compose up --build -d --wait api
docker compose exec -T api npm run seed
```

For local execution, install dependencies with `npm ci`, configure `MONGODB_URI`
in `.env` for an accessible MongoDB instance, then run `npm run seed`. The Compose
database has no published port, so use the Docker command for that database.
Compose supplies `mongodb://mongodb:27017/smartlog` inside the container.

Logs are stored in the `logs` collection. Mongoose provides `_id` and the JSON
`id` virtual. `payload` is optional because these fixtures are text-only;
no file resources or AI-generated analyses are fabricated.

### CORS configuration

Copy `.env.example` to `.env` and set `CORS_ALLOWED_ORIGINS` to exact browser
origins separated by commas, for example
`http://localhost:3000,http://localhost:5173`. The default is
`http://localhost:3000`; an empty value disables cross-origin access.
Schemes and ports must match. Preflight requests are handled automatically.
CORS controls browser access to responses; it does not authenticate clients or
block requests from tools such as curl.

`npm start` loads `.env` using Node's built-in environment file support. Existing
environment variables take precedence. Compose reads `.env` and passes the
allowlist into the API container. Restart the local app after changes, or run
`docker compose up -d --force-recreate api` for Docker.

With Node.js and npm installed:

```sh
npm ci
npm test
npm start
```

The Docker image uses Node 25 and installs production dependencies only.
