import type { RequestHandler } from "express";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const capacity = 20;
const refillPerSecond = 0.5;
const buckets = new Map<string, Bucket>();

// One map access and constant arithmetic per request gives expected O(1) token-bucket checks.
export const complaintRateLimit: RequestHandler = (request, response, next) => {
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  current.tokens = Math.min(
    capacity,
    current.tokens + ((now - current.updatedAt) / 1000) * refillPerSecond,
  );
  current.updatedAt = now;

  if (current.tokens < 1) {
    buckets.set(key, current);
    response.setHeader("Retry-After", "2");
    response.status(429).json({ error: "Rate limit exceeded; try again shortly." });
    return;
  }

  current.tokens -= 1;
  buckets.set(key, current);
  if (buckets.size > 5000) {
    for (const [address, bucket] of buckets) {
      if (now - bucket.updatedAt > 60 * 60 * 1000) buckets.delete(address);
    }
  }
  next();
};
