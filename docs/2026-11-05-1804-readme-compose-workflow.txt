Task: Simplify README and satisfy plain Docker Compose start/stop requirement.
User approved plan.

Reduced README to 77 lines focused on requirements, environment setup, docker
compose up/down, Docker-only tests, and sample data. Preserved detailed API and
configuration documentation in docs/REFERENCE.md and linked it from README.
Removed stale README statements claiming ingestion/analysis were unimplemented.

Added pull_policy: build to API and opt-in test images, using Docker's build cache
while rebuilding current source on compose up. Default app remains API + MongoDB.
Added test:all (coverage + integration + E2E) and made it the test image default.
README documents the full suite and unit-only Docker commands without host Node.
Architecture now records the required operational commands.

Verified exact commands:
- docker compose --profile test run --build --rm tests: passed 250 unit/HTTP tests,
  36 integration results and 30 E2E results; coverage thresholds passed.
- docker compose --profile test run --build --rm --no-deps tests npm test:
  250 tests passed without starting test API/database dependencies.
- docker compose down: stopped/removed API and MongoDB containers successfully.
- docker compose up (foreground, no extra flags): built current API, started both
  services, and localhost readiness returned 200.
- Second docker compose down stopped the foreground run and exited successfully.
- Application collection counts matched before/after down/up; no volumes removed.
- Documentation links and git diff --check passed.

Restored application in background with docker compose up -d --wait; API/MongoDB
healthy. Isolated test services remain stopped. No live Gemini calls were made.
Reference: Docker Compose service pull_policy documentation (build policy).
