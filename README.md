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
Database integration and log analysis are not implemented yet.

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

With Node.js and npm installed:

```sh
npm ci
npm test
npm start
```

The Docker image uses Node 25 and installs production dependencies only.
