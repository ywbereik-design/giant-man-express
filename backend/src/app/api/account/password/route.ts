import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, hashSecret, verifySecret, signSession, Role } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { consumeAttempt, clearAttempts } from "@/lib/rateLimit";

// Self-service password change for the currently logged-in Admin or Dispatch
// account — distinct from /api/staff/[id], which lets an ADMIN reset any
// staff member's password. This route only ever touches the caller's own row.
const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { currentPassword, newPassword } = body.data;
  const key = `account-password:${auth.session.sub}`;

  if (await consumeAttempt(key)) {
    return Response.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const staff = await prisma.staffUser.findUnique({ where: { id: auth.session.sub } });
  if (!staff || !(await verifySecret(currentPassword, staff.passwordHash))) {
    // 400, not 401: the caller's session/token is perfectly valid — only the
    // *current password* they supplied for confirmation was wrong. A 401
    // here would make the app's client treat this like an expired session
    // and force an unwanted logout instead of showing an inline form error.
    return Response.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  await clearAttempts(key);
  // Bumping tokenVersion invalidates every existing token for this account,
  // including this very request's — so a fresh token (reflecting the new
  // version) is issued and returned, letting the caller's own session
  // continue seamlessly while any other copy (e.g. a stolen token) stops
  // working immediately instead of surviving up to 30 more days.
  const updated = await prisma.staffUser.update({
    where: { id: staff.id },
    data: { passwordHash: await hashSecret(newPassword), tokenVersion: { increment: 1 } },
  });
  const token = await signSession({
    sub: updated.id,
    role: updated.role as Role,
    name: updated.name,
    tokenVersion: updated.tokenVersion,
  });
  return Response.json({ ok: true, token });
}
