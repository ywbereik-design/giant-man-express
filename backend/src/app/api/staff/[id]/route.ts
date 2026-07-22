import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

const STAFF_ROLES = ["ADMIN", "DISPATCH"] as const;

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  active: z.boolean().optional(),
});

// Would this change (demote, deactivate, or delete) leave the system with no
// active admin at all? If so, refuse — there'd be no way for anyone to fix it
// afterward. Only applies when the target is currently an active admin.
async function wouldRemoveLastActiveAdmin(targetId: string): Promise<boolean> {
  const target = await prisma.staffUser.findUnique({ where: { id: targetId } });
  if (!target || target.role !== "ADMIN" || !target.active) return false;
  const otherActiveAdmins = await prisma.staffUser.count({
    where: { role: "ADMIN", active: true, id: { not: targetId } },
  });
  return otherActiveAdmins === 0;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;
  const { password, role, active, ...rest } = body.data;

  const demotingOrDeactivating = role === "DISPATCH" || active === false;
  if (demotingOrDeactivating && (await wouldRemoveLastActiveAdmin(params.id))) {
    return Response.json(
      { error: "Can't change or deactivate the last remaining admin account" },
      { status: 400 }
    );
  }
  if (active === false && params.id === auth.session.sub) {
    return Response.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  const passwordHash = password ? await hashSecret(password) : undefined;
  const result = await runOrRespond(() =>
    prisma.staffUser.update({
      where: { id: params.id },
      data: {
        ...rest,
        ...(role ? { role } : {}),
        ...(active !== undefined ? { active } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ staff: result });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  if (params.id === auth.session.sub) {
    return Response.json({ error: "You can't delete your own account" }, { status: 400 });
  }
  if (await wouldRemoveLastActiveAdmin(params.id)) {
    return Response.json(
      { error: "Can't delete the last remaining admin account" },
      { status: 400 }
    );
  }

  const result = await runOrRespond(() => prisma.staffUser.delete({ where: { id: params.id } }));
  if (isResponse(result)) return result;

  return Response.json({ ok: true });
}
