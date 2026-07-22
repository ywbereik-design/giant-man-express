import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, getSessionFromRequest } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

// Any authenticated user (admin or driver) can read the job-type list —
// drivers need it to render job-type badges. Admins see inactive ones too.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const jobTypes = await prisma.jobType.findMany({
    where: session.role === "ADMIN" ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ jobTypes });
}

const createSchema = z.object({ name: z.string().trim().min(1) });

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;

  const result = await runOrRespond(() => prisma.jobType.create({ data: { name: body.data.name } }));
  if (isResponse(result)) return result;

  return Response.json({ jobType: result }, { status: 201 });
}
