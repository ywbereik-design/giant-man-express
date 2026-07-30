import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

export async function GET(req: NextRequest) {
  // Dispatch can see the client list (needed to assign jobs to a business)
  // but not financial details like billing rate — that stays ADMIN/
  // ACCOUNTANT-only. Checked by role below (not a separate allow-list),
  // so ACCOUNTANT falls through to the full-access branch same as ADMIN.
  const auth = await requireRole(req, ["ADMIN", "DISPATCH", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  if (auth.session.role === "DISPATCH") {
    const businesses = await prisma.business.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true },
    });
    return Response.json({ businesses });
  }

  const businesses = await prisma.business.findMany({ orderBy: { name: "asc" } });
  return Response.json({ businesses });
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  address: z.string().trim().optional(),
  billingRate: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;

  const result = await runOrRespond(() => prisma.business.create({ data: body.data }));
  if (isResponse(result)) return result;

  return Response.json({ business: result }, { status: 201 });
}
