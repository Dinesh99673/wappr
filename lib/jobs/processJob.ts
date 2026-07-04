import { MessageMedia } from "whatsapp-web.js";
import { prisma } from "@/lib/db/prisma";
import { getClient } from "@/lib/whatsapp/sessionManager";
import { resolveChatId } from "@/lib/whatsapp/resolveChatId";

/**
 * In-process, dependency-free bulk worker.
 *
 * Jobs are processed one at a time by a single background loop. Within a job,
 * recipients are sent STRICTLY sequentially with a randomized delay between
 * each send, and the session is re-checked before every send. If the session
 * drops mid-job the job is PAUSED (remaining recipients stay PENDING) so it can
 * be resumed later.
 */

type WorkerState = {
  queue: string[]; // jobIds waiting to be processed
  running: boolean;
};

const globalForWorker = globalThis as unknown as {
  __wapprWorker?: WorkerState;
};

const worker: WorkerState =
  globalForWorker.__wapprWorker ??
  (globalForWorker.__wapprWorker = { queue: [], running: false });

/**
 * Random delay (ms) in the job's configured window. The window is chosen by the
 * user on the bulk page (min locked at 5s, max draggable up to 60s) and stored
 * on the job as seconds.
 */
function randomDelayMs(minSec: number, maxSec: number): number {
  const lo = Math.min(minSec, maxSec) * 1000;
  const hi = Math.max(minSec, maxSec) * 1000;
  return Math.floor(lo + Math.random() * (hi - lo));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Queues a job for processing and ensures the worker loop is running. */
export function enqueueJob(jobId: string) {
  if (!worker.queue.includes(jobId)) worker.queue.push(jobId);
  void runWorker();
}

/**
 * Re-enqueues every RUNNING job at boot (the queue is in-memory, so a restart
 * would otherwise orphan them). If the session is down they just PAUSE.
 */
export async function rehydrateRunningJobs() {
  const running = await prisma.bulkJob.findMany({
    where: { status: "RUNNING" },
    select: { id: true },
  });
  for (const j of running) enqueueJob(j.id);
}

async function runWorker() {
  if (worker.running) return;
  worker.running = true;
  try {
    while (worker.queue.length > 0) {
      const jobId = worker.queue.shift()!;
      try {
        await processJob(jobId);
      } catch (err) {
        // Never let one job kill the loop.
        console.error(`[wappr] job ${jobId} crashed:`, err);
        await prisma.bulkJob
          .update({ where: { id: jobId }, data: { status: "FAILED" } })
          .catch(() => {});
      }
    }
  } finally {
    worker.running = false;
  }
}

async function processJob(jobId: string) {
  const job = await prisma.bulkJob.findUnique({ where: { id: jobId } });
  if (!job) return;

  // Only process jobs meant to be running.
  if (job.status !== "RUNNING") return;

  // Loop over PENDING recipients one at a time.
  // We refetch each iteration so resume/new recipients are picked up cleanly.
  while (true) {
    const recipient = await prisma.bulkJobRecipient.findFirst({
      where: { jobId, status: "PENDING" },
    });
    if (!recipient) break; // nothing left to do

    // Re-check the session before EVERY send.
    const client = await getClient();
    if (!client) {
      await prisma.bulkJob.update({
        where: { id: jobId },
        data: { status: "PAUSED" },
      });
      return; // leave remaining recipients PENDING
    }

    let sentOk = false;
    let errorMsg: string | null = null;

    const resolved = await resolveChatId(client, recipient.number);
    if (!resolved.ok) {
      errorMsg =
        resolved.reason === "NOT_REGISTERED"
          ? "Not on WhatsApp"
          : "Invalid number";
    } else {
      try {
        if (recipient.attachmentUrl) {
          const media = await MessageMedia.fromUrl(recipient.attachmentUrl, {
            unsafeMime: true,
          });
          await client.sendMessage(resolved.chatId, media, {
            caption:
              recipient.message && recipient.message.trim() !== ""
                ? recipient.message
                : undefined,
          });
        } else {
          await client.sendMessage(resolved.chatId, recipient.message ?? "");
        }
        sentOk = true;
      } catch (err) {
        errorMsg = (err as Error).message;
      }
    }

    // Persist this recipient's outcome and bump job counters immediately so
    // live polling reflects progress in real time.
    await prisma.bulkJobRecipient.update({
      where: { id: recipient.id },
      data: { status: sentOk ? "SENT" : "FAILED", error: errorMsg },
    });
    await prisma.bulkJob.update({
      where: { id: jobId },
      data: sentOk ? { sent: { increment: 1 } } : { failed: { increment: 1 } },
    });

    // Randomized delay before the next send (only if more remain).
    const remaining = await prisma.bulkJobRecipient.count({
      where: { jobId, status: "PENDING" },
    });
    if (remaining > 0) {
      await sleep(randomDelayMs(job.minDelaySec, job.maxDelaySec));
    }
  }

  await prisma.bulkJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED" },
  });
}
