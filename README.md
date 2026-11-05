# Smartlog Analyzer

A Node.js/Express API that stores microservice logs in MongoDB and uses Google Gemini to find patterns and generate insights.

## Requirements

Docker with a current Docker Compose version. Use Linux containers on Windows, Linux, or macOS. No local Node.js or MongoDB installation is needed.

## Setup

Create `.env` from [.env.example](.env.example), keeping any existing values. To enable AI analysis, set:

```env
GEMINI_API_KEY=your-key
GEMINI_MODEL=your-model
ANALYSIS_MODE=synthesis
```

The API can start without Gemini credentials; analysis requests need a valid key and compatible model.

## Start

From the repository root:

```sh
docker compose up
```

This builds the current API code, starts MongoDB, applies pending database migrations, and starts the API. Logs appear in the terminal.

- API: [http://localhost:3000/api](http://localhost:3000/api)
- Readiness: [http://localhost:3000/api/health](http://localhost:3000/api/health)

## Stop

From another terminal:

```sh
docker compose down
```

MongoDB data is preserved. Source changes are included the next time you run `docker compose up`.

## Tests

Run all unit, HTTP, database integration, and E2E tests, including coverage:

```sh
docker compose --profile test run --build --rm tests
```

Tests use a separate API/database and a Gemini stub. They do not use your API key or change application data. Coverage is printed in the terminal.

Stop the test services afterward:

```sh
docker compose --profile test stop api-test mongodb-test
```

To run only unit/HTTP tests:

```sh
docker compose --profile test run --build --rm --no-deps tests npm test
```

## Demo data

Migrations run automatically at startup. To run them explicitly (safe to rerun):

```sh
docker compose exec -T api npm run migrate
```

With the app running, insert 24 sample logs (safe to rerun):

```sh
docker compose exec -T api npm run seed
```

## Documentation

- [API and configuration reference](docs/REFERENCE.md)
- [Architecture and v2.0 TODOs](ARCHITECTURE.md)
