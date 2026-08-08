import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { MAX_JOB_TYPE_NAME_LENGTH } from "@/lib/constants";

// Any authenticated user (admin or driver) can read the job-type list —
// drivers need it to render job-type badges. Admins see inactive ones too.
// Two calls, not one shared "any role" helper, because a staff session and a
// driver session need different DB-side revocation checks (requireRole's
// active/tokenVersion re-check only covers staff roles; requireActiveDriver
// is Driver's equivalent) — this used to skip both via the lighter
// getSessionFromRequest (signature/expiry only), which meant a deactivated
// account or a token from before a password/PIN change could still call this
// successfully, unlike every other authenticated route.
export async function GET(req: NextRequest) {
  const staffAuth = await requireRole(req, ["ADMIN", "DISPATCH", "ACCOUNTANT"]);
  const auth = "error" in staffAuth ? await requireActiveDriver(req) : staffAuth;
  if ("error" in auth) return auth.error;

  const jobTypes = await prisma.jobType.findMany({
    where: auth.session.role === "ADMIN" ? {} : { active: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ jobTypes });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(MAX_JOB_TYPE_NAME_LENGTH) });

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;

  const result = await runOrRespond(() => prisma.jobType.create({ data: { name: body.data.name } }));
  if (isResponse(result)) return result;

  return Response.json({ jobType: result }, { status: 201 });
}
