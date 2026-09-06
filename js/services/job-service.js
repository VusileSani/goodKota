export class JobService {
  constructor(store, telemetry) {
    this.store = store;
    this.telemetry = telemetry;
  }

  processBatch(handlerMap = {}, maxJobs = 20) {
    const completed = [];
    for (let index = 0; index < Math.max(1, Math.min(Number(maxJobs) || 20, 100)); index += 1) {
      const job = this.processQueued(handlerMap);
      if (!job || !handlerMap[job.type]) break;
      completed.push(job);
    }
    return completed;
  }

  processQueued(handlerMap = {}) {
    const job = this.store.state.jobs.find(item => item.status === "queued" || (item.status === "retry" && item.nextAttemptAt <= Date.now()));
    if (!job) return null;
    const handler = handlerMap[job.type];
    if (!handler) return job;

    job.status = "running";
    job.attempts += 1;
    job.updatedAt = Date.now();
    try {
      const result = handler(job.payload, job);
      job.status = "completed";
      job.completedAt = Date.now();
      job.result = result ?? null;
      this.telemetry?.emit({ domain: "jobs", event: "job_completed", metadata: { jobId: job.id, type: job.type, attempts: job.attempts } });
    } catch (error) {
      job.lastError = error.message;
      if (job.attempts >= 5) {
        job.status = "dead_letter";
        this.telemetry?.alert({ type: "job_dead_letter", severity: "critical", domain: "jobs", message: `${job.type} failed after ${job.attempts} attempts`, metadata: { jobId: job.id } });
      } else {
        job.status = "retry";
        job.nextAttemptAt = Date.now() + Math.min(60_000, 1000 * 2 ** job.attempts);
      }
    }
    job.updatedAt = Date.now();
    this.store.save();
    return job;
  }
}
