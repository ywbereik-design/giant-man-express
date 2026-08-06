import { prisma } from "@/lib/db";

// DB-backed login-attempt throttle, keyed by e.g. "staff:email@x.com" or
// "driver:D001". Backed by the database (not an in-memory Map) because the
// backend runs as serverless functions in production, where each invocation
// can land on a different, short-lived process — in-memory state wouldn't
// reliably persist between requests.

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// Atomically increments this key's attempt count (resetting it first if the
// previous window has expired) and returns the new count in the same round
// trip via a single INSERT ... ON CONFLICT. This must be called and checked
// BEFORE the password/PIN comparison, not after — the previous design read
// the count, ran the slow bcrypt compare, and only recorded a failure
// afterward, which let concurrent requests all read the same pre-increment
// count before any of them wrote back. Verified live: 20 concurrent failed
// logins against one account all got through under that design. Using
// `$queryRaw` here (Prisma's parameterized tagged-template form, not string
// concatenation — still fully injection-safe) because this specific
// increment-with-conditional-reset can't be expressed as one atomic
// round trip through the high-level query builder.
export async function consumeAttempt(key: string): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + WINDOW_MS);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitAttempt" (key, count, "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimitAttempt"."resetAt" <= ${now} THEN 1 ELSE "RateLimitAttempt".count + 1 END,
      "resetAt" = CASE WHEN "RateLimitAttempt"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimitAttempt"."resetAt" END
    RETURNING count;
  `;
  return rows[0].count > MAX_ATTEMPTS;
}

export async function clearAttempts(key: string): Promise<void> {
  await prisma.rateLimitAttempt.deleteMany({ where: { key } });
}
