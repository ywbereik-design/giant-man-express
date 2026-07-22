import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

const STAFF_ROLES = ["ADMIN", "DISPATCH"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const staff = await prisma.staffUser.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });
  return Response.json({ staff });
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(STAFF_ROLES),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;
  const { name, email, password, role } = body.data;

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "That email is already in use" }, { status: 409 });
  }

  const passwordHash = await hashSecret(password);
  const result = await runOrRespond(() =>
    prisma.staffUser.create({
      data: { name, email, passwordHash, role },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ staff: result }, { status: 201 });
}
