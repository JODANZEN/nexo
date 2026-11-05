import type { RedisOptions } from 'bullmq';

// Connection options for BullMQ (it builds its own ioredis from these — we don't
// import ioredis directly, to avoid a duplicate-package type clash).
// lazyConnect so a missing/unreachable Redis doesn't block API boot.
// bullmq requires maxRetriesPerRequest: null.
export function bullConnection(): RedisOptions {
  const base: RedisOptions = { maxRetriesPerRequest: null, lazyConnect: true };
  const localhost = { host: '127.0.0.1', port: 6379, ...base };
  const url = process.env.REDIS_URL;
  if (!url) return localhost;

  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      username: u.username || undefined,
      password: u.password || undefined,
      tls: u.protocol === 'rediss:' ? {} : undefined,
      ...base,
    };
  } catch {
    // A malformed REDIS_URL must not crash boot — fall back, lazyConnect makes it harmless.
    console.warn('[redis] REDIS_URL is not a valid URL — using localhost fallback');
    return localhost;
  }
}
