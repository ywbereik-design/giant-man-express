import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { PHONE_PATTERN, MAX_TRUCK_RESPONSIBILITY_LENGTH, MAX_LICENSE_TEXT_LENGTH, DATE_ONLY_PATTERN } from "@/lib/constants";

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
  // Each of these four accepts "" to explicitly clear the field — same
  // "leave as-is if omitted, blank to remove" convention as phone above.
  truckResponsibility: z.union([z.string().trim().max(MAX_TRUCK_RESPONSIBILITY_LENGTH), z.literal("")]).optional(),
  licenseNumber: z.union([z.string().trim().max(MAX_LICENSE_TEXT_LENGTH), z.literal("")]).optional(),
  licenseExpiry: z.union([z.string().regex(DATE_ONLY_PATTERN, "Use YYYY-MM-DD format"), z.literal("")]).optional(),
  licenseGrade: z.union([z.string().trim().max(MAX_LICENSE_TEXT_LENGTH), z.literal("")]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;
  const { pin, truckResponsibility, licenseNumber, licenseGrade, licenseExpiry, ...rest } = body.data;
  const pinHash = pin ? await hashSecret(pin) : undefined;

  const result = await runOrRespond(() =>
    prisma.driver.update({
      where: { id: params.id },
      // Matches /api/account/pin's self-service reset — bumping tokenVersion
      // on an admin-driven PIN reset means an old (possibly compromised)
      // token stops authenticating immediately instead of staying valid for
      // up to 30 more days.
      data: {
        ...rest,
        ...(pinHash ? { pinHash, tokenVersion: { increment: 1 } } : {}),
        ...(truckResponsibility !== undefined ? { truckResponsibility: truckResponsibility || null } : {}),
        ...(licenseNumber !== undefined ? { licenseNumber: licenseNumber || null } : {}),
        ...(licenseGrade !== undefined ? { licenseGrade: licenseGrade || null } : {}),
        ...(licenseExpiry !== undefined ? { licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null } : {}),
      },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        phone: true,
        active: true,
        truckResponsibility: true,
        licenseNumber: true,
        licenseExpiry: true,
        licenseGrade: true,
      },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ driver: result });
}

// A driver with real history (jobs/shifts/reports) is refused by default —
// the app surfaces this as a "delete anyway?" confirmation rather than a
// dead end, and a confirmed retry sends ?force=true, which cascades through
// LocationPing/Job/TimeEntry/HoursReport before removing the driver itself.
// One case stays refused even with force: a job that's already a line item
// on an issued invoice. Deleting that job would leave a real, already-sent
// client invoice referencing a job that no longer exists — silently
// corrupting a financial record — so that one requires resolving the
// invoice first, not just an admin confirming a bigger warning dialog.
function invoicedErrorResponse(count: number) {
  return Response.json(
    {
      error: `This driver has ${count} job(s) already on an issued invoice and can't be deleted — resolve those invoices first.`,
      code: "INVOICED",
    },
    { status: 409 }
  );
}

// Thrown from inside the delete transaction below when the invoice re-check
// there finds a job that got billed after the earlier pre-check already
// passed — see the comment on that re-check for why it's needed.
class DriverInvoicedGuardError extends Error {
  constructor(public count: number) {
    super(`Driver has ${count} newly-invoiced job(s)`);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const driver = await prisma.driver.findUnique({ where: { id: params.id } });
  if (!driver) return Response.json({ error: "Not found" }, { status: 404 });

  const invoicedJobCount = await prisma.invoiceLineItem.count({
    where: { job: { driverId: params.id } },
  });
  if (invoicedJobCount > 0) {
    return invoicedErrorResponse(invoicedJobCount);
  }

  const force = new URL(req.url).searchParams.get("force") === "true";

  const [jobCount, timeEntryCount, hoursReportCount] = await Promise.all([
    prisma.job.count({ where: { driverId: params.id } }),
    prisma.timeEntry.count({ where: { driverId: params.id } }),
    prisma.hoursReport.count({ where: { driverId: params.id } }),
  ]);
  const hasHistory = jobCount > 0 || timeEntryCount > 0 || hoursReportCount > 0;
  if (hasHistory && !force) {
    return Response.json(
      {
        error: "This driver has job or shift history. Deleting will permanently remove all of it — jobs, clock-ins, location history, and reports. This cannot be undone.",
        code: "HAS_HISTORY",
      },
      { status: 409 }
    );
  }

  try {
    const result = await runOrRespond(async () => {
      if (!hasHistory) return prisma.driver.delete({ where: { id: params.id } });
      return prisma.$transaction(async (tx) => {
        // Re-check right before deleting, inside the same transaction as the
        // delete itself — the count above ran before this transaction even
        // opened, so a job could have been billed on a brand-new invoice (see
        // POST /api/invoices) in the gap between that check and this write.
        // Job.invoiceLineItems' FK is ON DELETE SET NULL (not RESTRICT), so
        // without this re-check the deleteMany below would succeed and
        // silently orphan that invoice line item (jobId -> null) instead of
        // failing loudly — exactly the "corrupting a financial record"
        // outcome this route exists to prevent.
        const stillInvoiced = await tx.invoiceLineItem.count({ where: { job: { driverId: params.id } } });
        if (stillInvoiced > 0) throw new DriverInvoicedGuardError(stillInvoiced);

        await tx.locationPing.deleteMany({ where: { driverId: params.id } });
        await tx.job.deleteMany({ where: { driverId: params.id } }); // JobStop rows cascade
        await tx.timeEntry.deleteMany({ where: { driverId: params.id } });
        await tx.hoursReport.deleteMany({ where: { driverId: params.id } });
        return tx.driver.delete({ where: { id: params.id } });
      });
    });
    if (isResponse(result)) return result;

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof DriverInvoicedGuardError) {
      return invoicedErrorResponse(err.count);
    }
    throw err;
  }
}
