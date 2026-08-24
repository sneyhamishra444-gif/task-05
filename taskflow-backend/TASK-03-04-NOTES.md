# Task 03 & Task 04 — Endpoint Reference & Design Notes

## Task 03 — Projects & Tasks

All endpoints require `Authorization: Bearer <accessToken>` and org
membership (`requireOrgMembership` validates `:orgId` against the DB,
never trusts it at face value).

### Projects — `/orgs/:orgId/projects`

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Paginated list (`?page=&limit=`) |
| POST | `/` | Create |
| GET | `/:projectId` | Get one |
| PATCH | `/:projectId` | Update |
| DELETE | `/:projectId` | Soft delete — **org_admin only** |
| GET | `/:projectId/dashboard` | `{ projectId, total, byStatus: {todo, in_progress, review, done} }` |

### Tasks — nested under a project for list/create

| Method | Path |
|---|---|
| GET | `/orgs/:orgId/projects/:projectId/tasks?status=&priority=&assignee=&dueDateFrom=&dueDateTo=&page=&limit=` |
| POST | `/orgs/:orgId/projects/:projectId/tasks` |

### Tasks — org-wide for everything else

| Method | Path | Notes |
|---|---|---|
| GET | `/orgs/:orgId/tasks/:taskId` | |
| PATCH | `/orgs/:orgId/tasks/:taskId` | |
| DELETE | `/orgs/:orgId/tasks/:taskId` | Soft delete |
| GET | `/orgs/:orgId/tasks/:taskId/assignments` | |
| POST | `/orgs/:orgId/tasks/:taskId/assignments` | `{ userId }` — 409 if already assigned; 422 if target user isn't a member of this org; **enqueues an async email job (Task 04)** |
| DELETE | `/orgs/:orgId/tasks/:taskId/assignments/:userId` | Unassign |
| PATCH | `/orgs/:orgId/tasks/bulk-status` *(bonus)* | `{ taskIds: string[], status }` |
| GET | `/orgs/:orgId/tasks/search?q=...` *(bonus)* | PostgreSQL full-text search |

Pagination response shape: `{ "data": [], "total": 0, "page": 1, "limit": 20 }`.

## Task 04 — Background Jobs & Email Notifications

### `GET /jobs/:jobId`

Requires `Authorization: Bearer <accessToken>`. Returns:
```json
{
  "id": "email-assign-<assignmentId>",
  "status": "pending | active | completed | failed",
  "metadata": {
    "queue": "email-notifications",
    "attemptsMade": 1,
    "maxAttempts": 4,
    "failedReason": null,
    "createdAt": "...", "processedAt": "...", "finishedAt": "...",
    "data": { "taskId": "...", "taskTitle": "...", "assignedUserEmail": "..." }
  }
}
```
Cross-tenant safe: the job's `orgId` is checked against the caller's org
memberships; a non-member gets `403`, an unknown job id gets `404`.

### Consistency strategy for the assignment endpoint (required write-up)

`POST /orgs/:orgId/tasks/:taskId/assignments` persists the assignment row
and enqueues the notification job **before** returning. Postgres and
Redis are separate systems with no shared transaction, so we chose
**fail-closed with a compensating rollback**: if the enqueue call throws,
the just-inserted assignment row is deleted and the request returns an
error — there is never a persisted assignment that silently never got a
notification attempt. The alternative (best-effort: keep the assignment,
log the failure, rely on a reconciliation job) is more resilient to
transient Redis blips but adds real operational complexity; the
compensating-rollback approach is simpler to reason about and verify.

### Retry / backoff / dead-letter queue

- `attempts: 4` (1 initial + 3 retries), `backoff: { type: "exponential", delay: 1000 }`
  → retries land at **1s, 2s, 4s** as required.
- On final failure, the worker writes a durable record to a separate
  `email-notifications-dlq` BullMQ queue (id `dlq-<originalJobId>`) with
  the failure reason, attempt count, and original payload, for audit/
  manual follow-up. The original job also correctly reports
  `status: "failed"` via `GET /jobs/:id`.
- Bonus: global rate limit — the worker is configured with
  `limiter: { max: 50, duration: 60000 }` (no more than 50 emails/minute).
- Bonus: 5-second dedupe — `enqueueAssignmentEmail` uses a Redis
  `SET NX EX 5` debounce key per `(taskId, assignedUserId)` pair before
  enqueueing, so rapid unassign/reassign or a retried request can't
  double-send a notification. The assign response includes
  `"deduped": true` when this happened, and `"notificationJobId": null`.

### What was verified live (not just written)

Full scripted run against the real Postgres+Redis stack:
- Assign → response includes `notificationJobId` → `GET /jobs/:id`
  immediately shows `"active"` → after the worker processes it, shows
  `"completed"` with correct `attemptsMade`/timestamps. Worker log
  confirms the mock "email" was logged.
- Unassign then immediately reassign the same user → second call returns
  `"deduped": true, "notificationJobId": null` (no duplicate job created).
- A forced-failure test user (`+faildemo` email, a deliberate worker test
  hook — see `src/jobs/email.worker.ts`) was assigned; polling
  `GET /jobs/:id` over time showed the retry attempts landing at the
  expected 1s/2s/4s backoff intervals, then `status: "failed"` with
  `attemptsMade: 4/4` once exhausted. The worker log showed exactly one
  "moved to dead-letter queue" line, and the DLQ record was confirmed
  present in Redis via `redis-cli hgetall` with the correct payload.
- `GET /jobs/:id` for an unknown id → `404 JOB_NOT_FOUND`.
- `GET /jobs/:id` from a user in a completely unrelated org → `403`.
