// Runs once on server start: boot the schedule ticker and re-enqueue orphaned
// jobs. Node-runtime + dynamic import so whatsapp-web.js stays out of the Edge
// bundle.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startScheduler } = await import("@/lib/jobs/scheduler");
  startScheduler();

  const { rehydrateRunningJobs } = await import("@/lib/jobs/processJob");
  await rehydrateRunningJobs();
}
