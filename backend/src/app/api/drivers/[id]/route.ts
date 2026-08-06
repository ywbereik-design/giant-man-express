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
      data: { ...rest, ...(pinHash ? { pinHash } : {}) },
      select: { id: true, name: true, employeeCode: true, phone: true, active: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ driver: result });
}
