import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { MAX_BUSINESS_TEXT_LENGTH, MAX_BUSINESS_CODE_LENGTH, PHONE_PATTERN } from "@/lib/constants";

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
      // code/phone/address are contact/lookup info (needed to find and
      // dispatch a job to this business), not a financial detail like
      // billingRate, so Dispatch gets them too.
      select: { id: true, name: true, code: true, address: true, phone: true },
    });
    return Response.json({ businesses });
  }

  const businesses = await prisma.business.findMany({ orderBy: { name: "asc" } });
  return Response.json({ businesses });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(MAX_BUSINESS_TEXT_LENGTH),
  code: z
    .string()
    .trim()
    .min(1)
    .max(MAX_BUSINESS_CODE_LENGTH)
    .transform((s) => s.toUpperCase())
    .optional(),
  contactName: z.string().trim().max(MAX_BUSINESS_TEXT_LENGTH).optional(),
  contactEmail: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  address: z.string().trim().max(MAX_BUSINESS_TEXT_LENGTH).optional(),
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
