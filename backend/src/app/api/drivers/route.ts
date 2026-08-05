import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { roundKm, startOfTodayUTC } from "@/lib/geo";
import { SHIFT_PHOTO_EXPIRY_MS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  // Dispatch gets read-only access here — they need the driver list to
  // assign jobs and monitor who's currently working, but can't manage
  // driver accounts (that stays ADMIN-only, see POST/PATCH below). Accountant
  // also gets read-only access, but only to the name/code list needed for the
  // driver picker on Hours Reports / Hours by Business — not the live
  // location, clock-in selfie, or active-job detail below, which is
  // operational data outside their invoices/reports/billing scope.
  const auth = await requireRole(req, ["ADMIN", "DISPATCH", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  if (auth.session.role === "ACCOUNTANT") {
    const drivers = await prisma.driver.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, employeeCode: true, active: true },
    });
    return Response.json({ drivers });
  }

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
      select: { driverId: true, clockInAt: true, clockInPhoto: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        clockInAt: { lt: dayEnd },
        OR: [{ clockOutAt: null }, { clockOutAt: { gte: dayStart } }],
      },
      select: { driverId: true, distanceKm: true },
    }),
  ]);

  // Each driver's most recently created not-yet-finished job — what stage of
  // the Accept -> Arrived -> Picked Up -> On the Way -> Delivered flow
  // they're currently on, for admin/dispatch to see at a glance without
  // opening the Jobs screen. A driver could in principle have more than one
  // active job at once; this surfaces the latest one, not all of them.
  const activeJobs = drivers.length
    ? await prisma.job.findMany({
        where: { driverId: { in: drivers.map((d) => d.id) }, status: { notIn: ["DELIVERED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        distinct: ["driverId"],
        select: { driverId: true, id: true, title: true, status: true },
      })
    : [];

  const openEntryByDriver = new Map(openEntries.map((e) => [e.driverId, e]));
  const todayDistanceByDriver = new Map<string, number>();
  for (const entry of todaysEntries) {
    todayDistanceByDriver.set(entry.driverId, (todayDistanceByDriver.get(entry.driverId) ?? 0) + entry.distanceKm);
  }
  const activeJobByDriver = new Map(activeJobs.map((j) => [j.driverId, j]));

  const now = Date.now();

  return Response.json({
    drivers: drivers.map((d) => {
      const open = openEntryByDriver.get(d.id);
      const expired = open ? now - open.clockInAt.getTime() > SHIFT_PHOTO_EXPIRY_MS : false;
      const activeJob = activeJobByDriver.get(d.id);
      return {
        ...d,
        clockedIn: !!open,
        todayDistanceKm: roundKm(todayDistanceByDriver.get(d.id) ?? 0),
        clockInAt: open?.clockInAt ?? null,
        clockInPhoto: open && !expired ? open.clockInPhoto : null,
        clockInPhotoExpired: expired,
        currentJobTitle: activeJob?.title ?? null,
        currentJobStatus: activeJob?.status ?? null,
      };
    }),
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
