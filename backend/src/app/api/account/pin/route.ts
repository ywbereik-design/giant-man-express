import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver, hashSecret, verifySecret } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rateLimit";

// Self-service PIN change for the currently logged-in driver — distinct from
// /api/drivers/[id], which lets an ADMIN reset any driver's PIN. This route
// only ever touches the caller's own row.
const schema = z.object({
  currentPin: z.string().min(1),
  newPin: z
    .string()
    .trim()
    .min(4)
    .max(8)
    .regex(/^\d+$/, "PIN must contain digits only"),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { currentPin, newPin } = body.data;
  const key = `account-pin:${auth.session.sub}`;

  if (await isRateLimited(key)) {
    return Response.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const driver = await prisma.driver.findUnique({ where: { id: auth.session.sub } });
  if (!driver || !(await verifySecret(currentPin, driver.pinHash))) {
    await recordFailedAttempt(key);
    // 400, not 401: the caller's session/token is perfectly valid — only the
    // *current PIN* they supplied for confirmation was wrong. A 401 here
    // would make the app's client treat this like an expired session and
    // force an unwanted logout instead of showing an inline form error.
    return Response.json({ error: "Current PIN is incorrect" }, { status: 400 });
  }

  await clearAttempts(key);
  await prisma.driver.update({
    where: { id: driver.id },
    data: { pinHash: await hashSecret(newPin) },
  });
  return Response.json({ ok: true });
}
