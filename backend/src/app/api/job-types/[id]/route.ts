import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { MAX_JOB_TYPE_NAME_LENGTH } from "@/lib/constants";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_JOB_TYPE_NAME_LENGTH).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;

  const result = await runOrRespond(() =>
    prisma.jobType.update({ where: { id: params.id }, data: body.data })
  );
  if (isResponse(result)) return result;

  return Response.json({ jobType: result });
}
