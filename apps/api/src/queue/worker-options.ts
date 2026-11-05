import type { WorkerOptions } from 'bullmq';

/**
 * Low-traffic worker tuning. This app processes only a handful of jobs a month
 * (Wompi webhooks, the monthly auto-charge cron, notification stubs), so the
 * default BullMQ poll/stall cadence wastes huge numbers of Redis requests on an
 * always-on server. These settings cut idle Redis traffic ~10x without adding
 * meaningful latency — a pushed job still wakes the blocking pop immediately;
 * drainDelay only governs how long we block when the queue is EMPTY.
 */
export const LAZY_WORKER_OPTS: Partial<WorkerOptions> = {
  concurrency: 1,
  drainDelay: 60, // seconds blocked on an empty queue (default 5)
  stalledInterval: 300_000, // ms between stalled-job checks (default 30_000)
  maxStalledCount: 1,
};
