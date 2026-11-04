# Smart log Analyzer
A tool to analyze logs from multiple microservices to identify patterns and generate insights.
The API will Read, analyze, store and process the logs.

## Stack
- Framework: Node 25 and Express 5.
- DB: MongoDb with Mongoose
- Tests: Jest
- Docker to run all the project
- Use Javascript

## Planned structure

`README.md` - Commands to run, how to test, AI use, todos.
`ARCHITECTURE.md` -  Tech decisions
`src/` - Source code
`src/routes` - Routes for the project
`src/controllers` - All controllers
`src/services` - Services
`src/middlewares` - Middlewares
`src/utils` - Utils, constants, etc.
`tests/` - Tests
`db/` - Migrations and seeds
`db/models` - For moongose schemas
`Dockerfile`
`docker-compose.yaml`
`.env.example`

## Development guidelines
- Keep controllers thin; put business logic in services.
- Handle errors through centralized Express error middleware and use a consistent JSON error response.
- Validate incoming log data before processing or storing it.
- Never commit secrets; document required variables in .env.example.
- Update README.md when setup or usage changes.

## Testing
- Add unit tests for business logic and integration tests for API/database behavior. Add E2E tests for critical flows. Cover happy paths, edge cases, and failures.
- Run relevant tests after changes and report any checks you could not run.
- Use synthetic logs in tests and redact sensitive data.

## Conventions 
- Use camelCase to variables and functions
- Be clear with the logic. Create a minimum description at every service.

## Workflow
- Before implementation, propose a plan and wait for approval.
- One task at time.
- Always create a file inside `docs/`, name format `YYYY-MM-DD-HHmm-name.txt`, we want a log for every task.
