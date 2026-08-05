import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { PHONE_PATTERN } from "@/lib/constants";

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  contactName: z.string().trim().optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  address: z.string().trim().optional(),
  billingRate: z.number().positive().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const business = await prisma.business.findUnique({ where: { id: params.id } });
  if (!business) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ business });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;

  const result = await runOrRespond(() =>
    prisma.business.update({ where: { id: params.id }, data: body.data })
  );
  if (isResponse(result)) return result;

  return Response.json({ business: result });
}
