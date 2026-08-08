import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { PHONE_PATTERN } from "@/lib/constants";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  active: z.boolean().optional(),
  pin: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^\d+$/, "PIN must contain digits only")
    .optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;
  const { pin, ...rest } = body.data;
  const pinHash = pin ? await hashSecret(pin) : undefined;

  const result = await runOrRespond(() =>
    prisma.driver.update({
      where: { id: params.id },
      // Matches /api/account/pin's self-service reset — bumping tokenVersion
      // on an admin-driven PIN reset means an old (possibly compromised)
      // token stops authenticating immediately instead of staying valid for
      // up to 30 more days.
      data: { ...rest, ...(pinHash ? { pinHash, tokenVersion: { increment: 1 } } : {}) },
      select: { id: true, name: true, employeeCode: true, phone: true, active: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ driver: result });
}

// Deliberately not a cascade delete — Job/TimeEntry/HoursReport all
// reference Driver with ON DELETE RESTRICT (see the schema/migrations), so
// a driver with any real history can't be deleted at the DB level regardless.
// This check exists to turn that into a clean, correct error message instead
// of a generic "referenced record" one, and to make the actual rule explicit:
// only a driver with zero jobs/shifts/reports (e.g. one added by mistake and
// never used) can be deleted here. Anyone with real history must be
// deactivated instead — full removal of an active driver's history is a
// deliberate, one-off operation, not something a single tap in the app
// should be able to trigger.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const driver = await prisma.driver.findUnique({ where: { id: params.id } });
  if (!driver) return Response.json({ error: "Not found" }, { status: 404 });

  const [jobCount, timeEntryCount, hoursReportCount] = await Promise.all([
    prisma.job.count({ where: { driverId: params.id } }),
    prisma.timeEntry.count({ where: { driverId: params.id } }),
    prisma.hoursReport.count({ where: { driverId: params.id } }),
  ]);
  if (jobCount > 0 || timeEntryCount > 0 || hoursReportCount > 0) {
    return Response.json(
      { error: "This driver has job or shift history and can't be deleted — deactivate them instead." },
      { status: 409 }
    );
  }

  const result = await runOrRespond(() => prisma.driver.delete({ where: { id: params.id } }));
  if (isResponse(result)) return result;

  return Response.json({ ok: true });
}
