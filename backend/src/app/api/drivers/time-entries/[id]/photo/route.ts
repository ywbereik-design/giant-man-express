import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

// Clears a clock-in selfie only — same reasoning as jobs/[id]/photo/route.ts
// (delete-only, never accepts a replacement image). clockInAt/clockOutAt/
// distanceKm are the actual shift record used for payroll and hours
// reports; those are left untouched.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const result = await runOrRespond(() =>
    prisma.timeEntry.update({
      where: { id: params.id },
      data: { clockInPhoto: null },
      select: { id: true, clockInPhoto: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ entry: result });
}
