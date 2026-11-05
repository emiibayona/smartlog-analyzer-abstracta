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

### Submit a log

`POST /api/logs` accepts one UTF-8 `application/json` object, up to 64 KiB.
No query parameters or client-supplied IDs are accepted.

```json
{
  "microservice": "inventory-service",
  "date": "2026-11-05T12:00:00.000Z",
  "level": "info",
  "message": "Stock lookup completed",
  "payload": "files/inventory.log"
}
```

Required fields are `microservice`, `date`, `level`, and `message`. Service names
must be one of the four documented warehouse services. Levels are exactly
`info`, `warn`, or `error`. Dates must be real ISO timestamps with timezone and
up to millisecond precision. Message must be non-blank and at most 16384 characters.
Optional `payload` is a non-blank file reference string of at most 4096 characters;
it is stored as text and is never fetched or opened. Unknown fields are rejected.

Successful insertion returns **201** with the saved log and its generated `id`.
Readable JSON that fails validation, or a primary insertion that fails to confirm,
is preserved in **`rejected_logs`** with the original JSON, request ID, timestamp,
reason, and validation issues. Only confirmed fallback writes return **202** with
`{ status: "quarantined", id, requestId, reason, issues }`. This means preserved
for later review, not a valid log or completed analysis. Invalid objects, arrays,
and JSON primitives are preserved in the fallback as JSON text.

Malformed/empty JSON returns 400, oversized requests 413, unsupported content
types/encodings 415; these transport failures are not quarantined. If neither
collection confirms storage, return 503 and retry. Both collections share MongoDB,
so fallback does not protect against a complete database outage. A timeout can
leave the primary write outcome uncertain: fallback records include the attempted
primary ID for future reconciliation. Retries are not yet idempotent and can
duplicate logs. No zero-loss guarantee is made for process crashes or outages.
Fallback records retain submitted content, potentially including sensitive data;
they are never printed in operational logs or exposed by a current read endpoint.

### v2.0 TODO — rejected-log management (not implemented)

- `GET /api/rejected-logs`: list/filter quarantined submissions.
- `GET /api/rejected-logs/:id`: inspect one quarantined submission.
- `PATCH /api/rejected-logs/:id`: correct a submission with validation.
- `POST /api/rejected-logs/:id/replay`: retry ingestion with reconciliation and idempotency.

These endpoints are planned for v2.0 and currently return 404. Access controls,
review/audit history, retry policy, and sensitive-data retention must be defined
before exposing them. Quarantined records are not retried automatically in v1.

### List logs

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

The analysis engine also records `Failed`, which is accepted by the status filter.

`GET /api/analysis/:id` returns one analysis directly, with a string `id` and no
MongoDB `_id` or `__v`. IDs must be 24 hexadecimal characters (case-insensitive).
Malformed IDs return 400; valid missing IDs return 404. Lookup accepts no query
parameters. Database timeouts return 503 and unexpected failures return generic 500.

Analyses use the `analyses` collection. Pending/in-progress records may omit
`result` and `message`. GET endpoints read saved records; they do not generate AI
analyses or populate the application database with synthetic analysis results.
Tests create temporary synthetic analyses only in the isolated test database.

### Analysis engine (service only)

The internal `analyzeLogs(logs)` service in `src/services/analysisEngine.js` analyzes
a batch and saves its findings. No analysis POST endpoint is implemented in this
wave. The caller must establish the MongoDB connection before invoking it.

Set `GEMINI_API_KEY` and `GEMINI_MODEL` in your local `.env`. Existing local values
are preserved; missing entries are placeholders until configured. Choose a Gemini
model available to your account that supports JSON Schema structured output.
The engine calls Google's `v1beta/models/{model}:generateContent` endpoint using
the `x-goog-api-key` header, JSON response MIME type, and a response JSON Schema.
It does not enable tools or automatic retries. OpenAI settings are no longer used.
Normal API startup and existing endpoints work without these optional settings.
Compose passes the settings to the application; test services never receive the
real key. No key or actual log contents are written to operational logs.

`ANALYSIS_MODE=synthesis` selects the analysis focus and is sent to every LLM
request and stored with the analysis metadata. Change it in `.env` without editing
code, then recreate the API container (`docker compose up -d --force-recreate api`)
or restart the local process. Mode labels must be lowercase identifiers with
optional digits/hyphens, up to 64 characters; empty values are rejected. The default
`synthesis` balances patterns, common issues, and insights. Other descriptive labels
(for example `patterns`) guide model emphasis, without changing the report schema
or guaranteeing a distinct algorithm. Chunking and the final synthesis phase are
internal orchestration and remain independent of the configured focus.

The service accepts 1–500 valid log objects, with optional stored `id`/`_id` values.
Dates can be ISO strings or Date objects. Duplicate stored IDs are rejected.
Input is capped at 256000 serialized bytes after common-secret redaction.
File-reference payloads are never fetched or sent to the provider.
Messages are treated as untrusted data, including any embedded instructions.
Common token/password/credential patterns are redacted before transmission;
this is a baseline filter, not a guarantee that arbitrary sensitive data is removed.

`ANALYSIS_CHUNK_BYTES` defaults to 24000 (range 1024–64000). Whole log records
are preserved, with at most 20 chunks. A record that cannot fit a chunk is rejected
rather than silently truncated. Multiple chunks receive a final synthesis pass
to correlate patterns and common issues. Each finding includes a title, severity,
description, recommendation, and evidence IDs validated against the submitted
batch. Reports contain `summary`, `patterns`, `commonIssues`, and `insights`.
Empty finding arrays are valid when evidence is insufficient. Counts by level
are calculated from the input, not estimated by the model.

`ANALYSIS_REQUEST_TIMEOUT_MS` defaults to 30000 (maximum 120000).
`ANALYSIS_TOTAL_TIMEOUT_MS` defaults to 120000 (maximum 600000), bounding the
provider phase across chunks and synthesis. Database writes have independent
5000 ms deadlines. Provider responses are capped at 256000 bytes and 8192 output
tokens; incomplete/refused/malformed responses fail instead of being saved as
successful reports. There are no automatic retries or partial-success results.

Gemini safety blocks/refusals, incomplete generations, and unexpected candidates
are treated as failures, not partial successes. Non-thought text parts are combined
and validated locally, including schema shape and evidence IDs.

Records transition `Pending` → `In progress` → `Completed` or `Failed`.
Completed records contain a structured `report`, JSON-string `result` for
compatibility, summary `message`, provider (`gemini`), model/prompt version, log/chunk counts, level
counts, timestamps, and input references. Mixed-service batches use
`microservice: "multiple"` with an explicit `microservices` array. Raw log batches
are not duplicated in the analysis collection; non-stored inputs have positional
references such as `input-1`. Failed records have a safe `errorCode`, without raw
provider responses or partial reports. If MongoDB cannot persist a failure, the
service raises `PERSISTENCE_FAILED`; an interrupted process can leave an unfinished
record. Durable job recovery/retry is outside this wave.

Unit tests cover chunking, synthesis, redaction, evidence validation, timeouts,
and persistence failures. Integration tests use real MongoDB plus a local HTTP
Gemini HTTP stub for valid output, wrong schema/JSON, prompt/candidate safety
blocks, incomplete output, multipart text, oversized responses, provider errors,
and timeout. They make no paid or live Gemini calls;
real-model quality and account access require a separate opt-in evaluation.

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
