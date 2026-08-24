import { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { emailQueue, EMAIL_QUEUE_NAME } from "../../lib/queue";
import { db } from "../../db/client";
import { orgMembers } from "../../db/schema";
import { Errors } from "../../utils/errors";

/**
 * Maps BullMQ's internal job states onto the four statuses the
 * assignment requires: pending, active, completed, failed.
 */
const STATE_MAP: Record<string, "pending" | "active" | "completed" | "failed"> = {
  waiting: "pending",
  "waiting-children": "pending",
  delayed: "pending",
  prioritized: "pending",
  active: "active",
  completed: "completed",
  failed: "failed",
  unknown: "pending",
};

export async function getJobStatus(userId: string, jobId: string) {
  const job = await Job.fromId(emailQueue, jobId);

  if (!job) {
    throw Errors.notFound("Job", "JOB_NOT_FOUND");
  }

  // Cross-tenant safety: only members of the org this job's assignment
  // belongs to can view it, same policy as every other resource.
  const orgId: string | undefined = job.data?.orgId;
  if (orgId) {
    const [membership] = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
      .limit(1);
    if (!membership) {
      throw Errors.forbidden("You do not have access to this job");
    }
  }

  const state = await job.getState();

  return {
    id: job.id,
    status: STATE_MAP[state] ?? "pending",
    metadata: {
      queue: EMAIL_QUEUE_NAME,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 1,
      failedReason: job.failedReason ?? null,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      data: {
        taskId: job.data?.taskId,
        taskTitle: job.data?.taskTitle,
        assignedUserEmail: job.data?.assignedUserEmail,
      },
    },
  };
}
