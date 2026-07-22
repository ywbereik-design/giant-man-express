import { prisma } from "@/lib/db";

// Atomically increments a named counter and returns a zero-padded,
// prefixed sequential number, e.g. nextNumber("HR", "hours_report") -> "HR-0001"
export async function nextNumber(prefix: string, counterName: string): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { name: counterName },
    update: { value: { increment: 1 } },
    create: { name: counterName, value: 1 },
  });
  return `${prefix}-${String(counter.value).padStart(4, "0")}`;
}
