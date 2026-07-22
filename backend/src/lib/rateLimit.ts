import { prisma } from "@/lib/db";

// DB-backed login-attempt throttle, keyed by e.g. "staff:email@x.com" or
// "driver:D001". Backed by the database (not an in-memory Map) because the
// backend runs as serverless functions in production, where each invocation
// can land on a different, short-lived process — in-memory state wouldn't
// reliably persist between requests.

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function isRateLimited(key: string): Promise<boolean> {
  const row = await prisma.rateLimitAttempt.findUnique({ where: { key } });
  if (!row || row.resetAt <= new Date()) return false;
  return row.count >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(key: string): Promise<void> {
  const now = new Date();
  const existing = await prisma.rateLimitAttempt.findUnique({ where: { key } });

  if (!existing || existing.resetAt <= now) {
    await prisma.rateLimitAttempt.upsert({
      where: { key },
      update: { count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) },
      create: { key, count: 1, resetAt: new Date(now.getTime() + WINDOW_MS) },
    });
    return;
  }

  await prisma.rateLimitAttempt.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
}

export async function clearAttempts(key: string): Promise<void> {
  await prisma.rateLimitAttempt.deleteMany({ where: { key } });
}
