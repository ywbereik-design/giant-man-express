import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

// Deliberately delete-only — clears the stored photo (a "we no longer need
// this proof image on file" action, e.g. for storage/privacy cleanup), never
// sets one. Allowing an arbitrary photo value here would let anyone with
// admin/dispatch access inject fake pickup/delivery "proof" after the fact;
// the only real photo capture path stays the driver's own device via the
// status route. GPS/timestamps for the stage aren't touched — those are the
// actual business record (when/where it happened, used for billing/reports),
// not the supporting image.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const type = new URL(req.url).searchParams.get("type");
  if (type !== "pickup" && type !== "delivery") {
    return Response.json({ error: "type must be 'pickup' or 'delivery'" }, { status: 400 });
  }

  const result = await runOrRespond(() =>
    prisma.job.update({
      where: { id: params.id },
      data: type === "pickup" ? { pickupPhoto: null } : { deliveryPhoto: null },
      select: { id: true, pickupPhoto: true, deliveryPhoto: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ job: result });
}
