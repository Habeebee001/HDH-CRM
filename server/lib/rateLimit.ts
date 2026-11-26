type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Fixed-window rate limiter kept in memory. Returns false when `key` was
 * used more than `max` times in the current window.
 */
export const allow = (key: string, max: number, windowMs: number) => {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
};

/** True when `key` already reached `max` hits in the current window. */
export const isLimited = (key: string, max: number) => {
  const bucket = buckets.get(key);
  return !!bucket && bucket.resetAt > Date.now() && bucket.count >= max;
};

/** Counts one hit for `key` (e.g. a failed sign-in). */
export const hit = (key: string, windowMs: number) => {
  allow(key, Number.POSITIVE_INFINITY, windowMs);
};

export const reset = (key: string) => {
  buckets.delete(key);
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();
