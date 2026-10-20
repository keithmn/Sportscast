// Wraps a scheduled job so every run is recorded in JobRun (see the model
// in prisma/schema.prisma) and a failure raises an alert. A job may return
// a short string (e.g. "backup 2.1 MB") that is kept as the run's detail.
// Never throws: a failing job must not take the server down.

const prisma = require('../db');
const { sendAlert } = require('./alerts');

const running = new Set();

async function runJob(job, fn) {
  // Two overlapping runs of the same job (a slow sync and the next tick)
  // would race on the same rows; skip the second one.
  if (running.has(job)) return null;
  running.add(job);
  const started = Date.now();
  let run = null;
  try {
    run = await prisma.jobRun.create({ data: { job } });
  } catch (err) {
    console.error(`[jobRuns] could not record ${job}: ${err.message}`);
  }
  try {
    const detail = await fn();
    if (run) {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { status: 'OK', finishedAt: new Date(), durationMs: Date.now() - started, detail: typeof detail === 'string' ? detail.slice(0, 300) : null },
      }).catch(() => {});
    }
    return detail;
  } catch (err) {
    const message = String(err && err.message ? err.message : err).slice(0, 500);
    console.error(`[${job}] failed:`, err);
    if (run) {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: { status: 'ERROR', finishedAt: new Date(), durationMs: Date.now() - started, error: message },
      }).catch(() => {});
    }
    await sendAlert(`job:${job}`, `scheduled job "${job}" failed: ${message}`);
    return null;
  } finally {
    running.delete(job);
  }
}

module.exports = { runJob };
