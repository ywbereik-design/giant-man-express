import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signSession, verifySecret, DUMMY_HASH, Role } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rateLimit";

// Shared login for both Admin and Dispatch accounts — both are "staff",
// distinguished by the role stored on their StaffUser row, not by which
// login tab the app's UI happened to show. The client routes post-login
// screens off the role this endpoint returns.
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { email, password } = body.data;
  const key = `staff:${email.toLowerCase()}`;

  if (await isRateLimited(key)) {
    return Response.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const staff = await prisma.staffUser.findUnique({ where: { email: email.toLowerCase() } });
  const passwordOk = await verifySecret(password, staff?.passwordHash ?? DUMMY_HASH);

  if (!staff || !staff.active || !passwordOk) {
    await recordFailedAttempt(key);
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await clearAttempts(key);
  const role = staff.role as Role;
  const token = await signSession({ sub: staff.id, role, name: staff.name, tokenVersion: staff.tokenVersion });
  return Response.json({ token, name: staff.name, role, id: staff.id });
}
