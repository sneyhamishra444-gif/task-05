import { Queue } from "bullmq";
import { redis } from "./redis";
import type { AssignmentEmailJobData } from "../jobs/email.types";

export const EMAIL_QUEUE_NAME = "email-notifications";
export const EMAIL_DLQ_NAME = "email-notifications-dlq";

/**
 * The DLQ is a plain BullMQ Queue used purely as durable storage/audit
 * trail - nothing ever calls `Worker` against it. When the primary
 * worker exhausts its retries on a job, it writes a record here (see
 * jobs/email.worker.ts) so failed notifications remain inspectable
 * (and re-processable by a human/ops job later) instead of just vanishing.
 */
export const emailQueue = new Queue<AssignmentEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
});
export const emailDlq = new Queue(EMAIL_DLQ_NAME, { connection: redis });

interface EnqueueResult {
  deduped: boolean;
  jobId: string | null;
}

/**
 * Bonus: deduplicate assignments within 5 seconds. Guards against
 * notification storms from rapid unassign/reassign or a retried request
 * for the *same* task+user pair - a Redis SET NX EX 5 acts as a short
 * debounce window. This is independent of the DB-level uniqueness
 * constraint on (task_id, user_id), which prevents a duplicate
 * *assignment row* outright; this dedupe specifically protects the
 * notification side.
 */
export async function enqueueAssignmentEmail(
  data: AssignmentEmailJobData
): Promise<EnqueueResult> {
  const dedupeKey = `dedupe:assign-email:${data.taskId}:${data.assignedUserId}`;
  const acquired = await redis.set(dedupeKey, "1", "EX", 5, "NX");

  if (!acquired) {
    return { deduped: true, jobId: null };
  }

  const job = await emailQueue.add("assignment-notification", data, {
    // Deterministic id ties 1:1 to the assignment row, so GET /jobs/:id
    // is a simple lookup and a retried enqueue call for the same
    // assignment can't create a second job.
    jobId: `email-assign-${data.assignmentId}`,
    // 1 initial attempt + 3 retries, per the assignment's "retry 3 times"
    // requirement (attemptsMade counts up as retries happen).
    attempts: 4,
    // BullMQ's exponential backoff is delay * 2^(attemptsMade-1), so with
    // delay=1000 the three retries land at 1s, 2s, 4s as required.
    backoff: { type: "exponential", delay: 1000 },
    // Keep completed jobs around briefly so GET /jobs/:id still works
    // right after completion; keep failed jobs indefinitely for audit
    // (mirrors the DLQ record, easy to compare).
    removeOnComplete: { age: 3600 },
    removeOnFail: false,
  });

  return { deduped: false, jobId: job.id ?? null };
}
