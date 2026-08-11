import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { MAX_BUSINESS_TEXT_LENGTH, MAX_BUSINESS_CODE_LENGTH, PHONE_PATTERN } from "@/lib/constants";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_BUSINESS_TEXT_LENGTH).optional(),
  // "" explicitly clears the code back to unset — same convention as
  // Driver's vehicle/license fields in /api/drivers/[id].
  code: z.union([z.string().trim().min(1).max(MAX_BUSINESS_CODE_LENGTH), z.literal("")]).optional(),
  contactName: z.string().trim().max(MAX_BUSINESS_TEXT_LENGTH).optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  address: z.string().trim().max(MAX_BUSINESS_TEXT_LENGTH).optional(),
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
  const { code, ...rest } = body.data;

  const result = await runOrRespond(() =>
    prisma.business.update({
      where: { id: params.id },
      // "" -> null (not "") so the unique constraint on code never sees
      // more than one business "cleared" to the same empty-string value.
      data: { ...rest, ...(code !== undefined ? { code: code ? code.toUpperCase() : null } : {}) },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ business: result });
}
