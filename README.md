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
Database seeding is available; API database operations and log analysis are not implemented yet.

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

Check the API at `http://localhost:3000/api`. `/api/health` is not implemented yet.

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
