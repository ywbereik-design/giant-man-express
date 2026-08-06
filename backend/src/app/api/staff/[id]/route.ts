import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { runOrRespond, isResponse } from "@/lib/dbErrors";

const STAFF_ROLES = ["ADMIN", "DISPATCH", "ACCOUNTANT"] as const;

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  active: z.boolean().optional(),
});

// Arbitrary fixed key — every admin-guard-relevant write takes this same
// Postgres advisory lock for the duration of its transaction, so two
// concurrent requests (e.g. demoting two *different* admins at once) are
// serialized against each other instead of both reading "N other admins
// remain" from the same stale pre-write snapshot. Without this, two such
// requests issued while exactly 2 active admins exist could each
// independently see "1 other admin remains" and both succeed, leaving zero
// active admins with no self-service way to recover.
const LAST_ADMIN_LOCK_KEY = 913042;

class LastAdminGuardError extends Error {}

// Would this change (demote, deactivate, or delete) leave the system with no
// active admin at all? If so, refuse — there'd be no way for anyone to fix it
// afterward. Only applies when the target is currently an active admin. Must
// be called with a transaction client that already holds LAST_ADMIN_LOCK_KEY,
// so the count it reads can't go stale before the caller's own write commits.
async function assertWouldNotRemoveLastActiveAdmin(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  targetId: string,
  message: string
): Promise<void> {
  const target = await tx.staffUser.findUnique({ where: { id: targetId } });
  if (!target || target.role !== "ADMIN" || !target.active) return;
  const otherActiveAdmins = await tx.staffUser.count({
    where: { role: "ADMIN", active: true, id: { not: targetId } },
  });
  if (otherActiveAdmins === 0) throw new LastAdminGuardError(message);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, updateSchema);
  if (isError(body)) return body.error;
  const { password, role, active, ...rest } = body.data;

  if (active === false && params.id === auth.session.sub) {
    return Response.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  // Any role change away from ADMIN counts as a demotion for this guard —
  // written this way (rather than listing each non-admin role) so adding a
  // future role can't silently bypass the last-admin check the way hardcoding
  // just "DISPATCH" already almost did when ACCOUNTANT was added.
  const demotingOrDeactivating = (role !== undefined && role !== "ADMIN") || active === false;
  const passwordHash = password ? await hashSecret(password) : undefined;

  try {
    const result = await runOrRespond(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LAST_ADMIN_LOCK_KEY})`;
        if (demotingOrDeactivating) {
          await assertWouldNotRemoveLastActiveAdmin(
            tx,
            params.id,
            "Can't change or deactivate the last remaining admin account"
          );
        }
        return tx.staffUser.update({
          where: { id: params.id },
          data: {
            ...rest,
            ...(role ? { role } : {}),
            ...(active !== undefined ? { active } : {}),
            ...(passwordHash ? { passwordHash } : {}),
          },
          select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
        });
      })
    );
    if (isResponse(result)) return result;
    return Response.json({ staff: result });
  } catch (err) {
    if (err instanceof LastAdminGuardError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, "ADMIN");
  if ("error" in auth) return auth.error;

  if (params.id === auth.session.sub) {
    return Response.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  try {
    const result = await runOrRespond(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LAST_ADMIN_LOCK_KEY})`;
        await assertWouldNotRemoveLastActiveAdmin(
          tx,
          params.id,
          "Can't delete the last remaining admin account"
        );
        return tx.staffUser.delete({ where: { id: params.id } });
      })
    );
    if (isResponse(result)) return result;
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof LastAdminGuardError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
