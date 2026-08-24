import "dotenv/config";
import { Worker, Job } from "bullmq";
import { redis } from "../lib/redis";
import { EMAIL_QUEUE_NAME, emailDlq } from "../lib/queue";
import type { AssignmentEmailJobData } from "./email.types";

/**
 * Mock email sender. Per the assignment, real email delivery isn't
 * required - this simulates latency and logs what would have been sent.
 *
 * Test hook: if the recipient address contains "+faildemo" it always
 * throws, so retry/backoff/DLQ behavior can be demonstrated on demand
 * (e.g. for the submission's demo video) without waiting for a real
 * transient failure. It never triggers on ordinary addresses.
 */
async function sendMockEmail(data: AssignmentEmailJobData): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 150));

  if (data.assignedUserEmail.includes("+faildemo")) {
    throw new Error("Simulated email delivery failure (faildemo test hook)");
  }

  // eslint-disable-next-line no-console
  console.log(
    `[email-worker] Sent: "${data.assignedUserName} <${data.assignedUserEmail}>" ` +
      `was assigned to task "${data.taskTitle}" (assignment ${data.assignmentId})`
  );
}

export const emailWorker = new Worker<AssignmentEmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<AssignmentEmailJobData>) => {
    await sendMockEmail(job.data);
  },
  {
    connection: redis,
    concurrency: 5,
    // Bonus: global rate limit across all jobs processed by this worker -
    // no more than 50 emails/minute.
    limiter: { max: 50, duration: 60_000 },
  }
);

emailWorker.on("completed", (job) => {
  // eslint-disable-next-line no-console
  console.log(`[email-worker] job ${job.id} completed`);
});

emailWorker.on("failed", async (job, err) => {
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;
  // eslint-disable-next-line no-console
  console.error(
    `[email-worker] job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${err.message}`
  );

  if (job.attemptsMade >= maxAttempts) {
    // Retries exhausted - move to the dead-letter queue for audit/manual
    // follow-up. The job itself remains queryable via GET /jobs/:id and
    // correctly reports status "failed" (BullMQ keeps failed jobs in its
    // own failed set; removeOnFail:false in queue.ts ensures it isn't
    // pruned).
    try {
      await emailDlq.add(
        "dead-letter",
        {
          originalJobId: job.id,
          queue: EMAIL_QUEUE_NAME,
          data: job.data,
          failedReason: err.message,
          attemptsMade: job.attemptsMade,
          failedAt: new Date().toISOString(),
        },
        { jobId: `dlq-${job.id}` }
      );
      // eslint-disable-next-line no-console
      console.error(`[email-worker] job ${job.id} moved to dead-letter queue`);
    } catch (dlqErr) {
      // eslint-disable-next-line no-console
      console.error(`[email-worker] failed to write DLQ record for job ${job.id}:`, dlqErr);
    }
  }
});

emailWorker.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[email-worker] worker error:", err.message);
});

// eslint-disable-next-line no-console
console.log(`[email-worker] listening for jobs on "${EMAIL_QUEUE_NAME}"`);
