import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { roundKm, startOfTodayUTC } from "@/lib/geo";

export async function GET(req: NextRequest) {
  // Dispatch gets read-only access here — they need the driver list to
  // assign jobs and monitor who's currently working, but can't manage
  // driver accounts (that stays ADMIN-only, see POST/PATCH below).
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const dayStart = startOfTodayUTC();
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [drivers, openEntries, todaysEntries] = await Promise.all([
    prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        phone: true,
        active: true,
        createdAt: true,
        currentLat: true,
        currentLng: true,
        currentLocationAt: true,
      },
    }),
    prisma.timeEntry.findMany({
      where: { clockOutAt: null },
      select: { driverId: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        clockInAt: { lt: dayEnd },
        OR: [{ clockOutAt: null }, { clockOutAt: { gte: dayStart } }],
      },
      select: { driverId: true, distanceKm: true },
    }),
  ]);

  const clockedInIds = new Set(openEntries.map((e) => e.driverId));
  const todayDistanceByDriver = new Map<string, number>();
  for (const entry of todaysEntries) {
    todayDistanceByDriver.set(entry.driverId, (todayDistanceByDriver.get(entry.driverId) ?? 0) + entry.distanceKm);
  }

  return Response.json({
    drivers: drivers.map((d) => ({
      ...d,
      clockedIn: clockedInIds.has(d.id),
      todayDistanceKm: roundKm(todayDistanceByDriver.get(d.id) ?? 0),
    })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  employeeCode: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.toUpperCase()),
  pin: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^\d+$/, "PIN must contain digits only"),
  phone: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;
  const { name, employeeCode, pin, phone } = body.data;

  const existing = await prisma.driver.findUnique({ where: { employeeCode } });
  if (existing) {
    return Response.json({ error: "That employee code is already in use" }, { status: 409 });
  }

  const pinHash = await hashSecret(pin);
  const result = await runOrRespond(() =>
    prisma.driver.create({
      data: { name, employeeCode, phone, pinHash },
    })
  );
  if (isResponse(result)) return result;

  return Response.json(
    {
      driver: {
        id: result.id,
        name: result.name,
        employeeCode: result.employeeCode,
        phone: result.phone,
        active: result.active,
      },
    },
    { status: 201 }
  );
}
