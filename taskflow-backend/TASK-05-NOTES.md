# Task 05 — Testing & API Documentation

## Testing

**Test isolation strategy:** a dedicated `taskflow_test` database, created
and migrated once in Jest's `globalSetup` (`tests/globalSetup.js`), with a
full `TRUNCATE ... RESTART IDENTITY CASCADE` of every app table before
each test (`tests/helpers/db.ts`). Per-test transaction rollback was
considered but rejected: the app under test owns its own connection pool
and each HTTP request (via supertest) goes through the full Express
stack, so there's no single transaction to wrap a whole request in
without invasive changes to the app itself. Truncation is simple, fully
reliable, and fast enough at this schema size to run before every test.

Run:
```bash
npm test              # unit + integration, real Postgres + Redis
npm run test:coverage # same, plus an HTML/lcov coverage report in coverage/
```

`maxWorkers: 1` is set deliberately — integration tests share one
Postgres/Redis instance and truncate tables between tests, so they must
not run concurrently.

**Suite: 9 files, 61 tests, all passing.**

### Unit tests (`tests/unit/`)
- `pagination.test.ts` — the pagination helper: defaults, offset math,
  invalid/negative/fractional input, limit capping, response shape.
- `auth-logic.test.ts` — bcrypt hash/verify round-trip and salting, JWT
  access/refresh sign+verify round-trip, tamper detection, token hashing.
- `task-assignment-validation.test.ts` — the Zod schemas behind
  assignment, bulk-status-update, and task filters.

### Integration tests (`tests/integration/`), real Postgres + Redis via supertest
- `auth.test.ts` — register → login flow, duplicate email, wrong
  password, `/auth/me`, refresh token rotation + reuse rejection, logout
  revocation.
- `rate-limit.test.ts` — confirms `/auth/*` returns 429 once the per-IP
  limit is exceeded (run in an isolated module registry with a low
  test-specific limit so it doesn't interfere with other suites).
- `tasks.test.ts` — project/task CRUD, status/priority filters, the
  project dashboard's per-status counts, task assignment (valid + 409
  duplicate + 422 non-member), pagination response shape.
- `cross-tenant.test.ts` — **the required 403 cross-tenant checks**: Org
  B addressing Org A's `orgId` directly (members, projects), Org B unable
  to see an Org A task even under its own `orgId` (404, no leak), and a
  non-admin member blocked from admin-only actions.
- `validation.test.ts` — the required `{error, code, details}` shape for
  Zod failures, 404s with resource-specific codes, 401s for missing/bad
  tokens, 404 for unknown routes.
- `jobs.test.ts` *(bonus: "test that task assignment creates a queue
  job")* — asserts a real BullMQ job exists in Redis after assignment
  (`Job.fromId`, not just the API response), checks its payload, and
  confirms `GET /jobs/:id` cross-tenant access control.

## API Documentation

### OpenAPI / Swagger

`docs/openapi.yaml` — hand-written OpenAPI 3.0 spec, 20 paths, covering
every endpoint from Tasks 01–04 (auth, org members, projects, tasks,
jobs), with request/response schemas and a bearer-JWT security scheme.

Served locally by the running API itself:
- **Swagger UI:** `http://localhost:3000/docs`
- **Raw spec:** `http://localhost:3000/openapi.json`

No separate process needed — `src/app.ts` loads and serves it directly
whenever the API starts.

### Postman collection

`docs/TaskFlow.postman_collection.json` — 28 requests across 6 folders
(Auth, Organization Members, Projects, Tasks, Jobs, Cleanup).

**Imports and runs with zero manual edits.** Every id/token a later
request needs is captured automatically by the previous request's Tests
script into collection variables (`accessToken`, `orgId`, `projectId`,
`taskId`, `memberUserId`, `jobId`, ...). Just import into Postman, make
sure the API is running at `{{baseUrl}}` (defaults to
`http://localhost:3000`), and run the folders top-to-bottom (or use
Collection Runner on the whole collection).

**Verified for real**, not just written: ran the entire collection
through [Newman](https://www.npmjs.com/package/newman) (Postman's CLI
runner) against the live API + worker. All **28/28 requests** returned
the expected status codes on a clean run — including the full
assign-a-task → `notificationJobId` gets captured →
`GET /jobs/:jobId` chain resolving to `200 OK`. Two real ordering bugs
were caught and fixed this way (a project/member getting deleted before
a later folder still needed it) — evidence the "no manual edits" claim
is actually true, not just asserted.

Design notes:
- `Register` uses Postman's `{{$timestamp}}` dynamic variable for a
  unique email each run, so re-running the whole collection repeatedly
  never collides on "already registered".
- `Login` re-authenticates as the *same* user `Register` just created
  (captured into `registeredEmail`/`registeredPassword`), keeping
  `accessToken` and `orgId` consistent for every subsequent request. An
  earlier draft of this collection hardcoded a seeded demo login here,
  which silently broke every later request with 403s once `accessToken`
  and `orgId` pointed at two different organizations - the Newman run
  caught this immediately.
- `Delete project` and `Remove a member` live in a final **06 - Cleanup**
  folder, not inline in their own folders — an earlier draft deleted the
  project before the Tasks folder needed it, and removed the member
  before the assignment request needed them. Moving cleanup to the end
  fixed both.
- Running the whole collection more than once within 60 seconds can trip
  the 10-req/min/IP auth rate limiter (by design — see Task 02) since
  Register/Login/Refresh/Logout/Logout-all/Register-again is 6 calls to
  `/auth/*` per run. This is correct behavior, not a bug.
