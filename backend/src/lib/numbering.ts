import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Atomically increments a named counter and returns a zero-padded,
// prefixed sequential number, e.g. nextNumber("HR", "hours_report") -> "HR-0001"
//
// Accepts an optional transaction client so the increment can be composed
// into the same transaction as the row that actually consumes the number —
// otherwise a later failure in that row's insert (e.g. a unique-constraint
// collision from a concurrent duplicate request) leaves the counter
// incremented with nothing using the number, producing a permanent gap in
// the visible sequence (INV-0042 never appears, jumps straight to INV-0043).
export async function nextNumber(
  prefix: string,
  counterName: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<string> {
  const counter = await client.counter.upsert({
    where: { name: counterName },
    update: { value: { increment: 1 } },
    create: { name: counterName, value: 1 },
  });
  return `${prefix}-${String(counter.value).padStart(4, "0")}`;
}
