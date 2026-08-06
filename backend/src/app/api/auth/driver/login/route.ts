import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { signSession, verifySecret, DUMMY_HASH } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { consumeAttempt, clearAttempts } from "@/lib/rateLimit";

const schema = z.object({
  employeeCode: z.string().min(1),
  pin: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;
  const { employeeCode, pin } = body.data;
  const key = `driver:${employeeCode.toUpperCase()}`;

  if (await consumeAttempt(key)) {
    return Response.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 }
    );
  }

  const driver = await prisma.driver.findUnique({ where: { employeeCode: employeeCode.toUpperCase() } });
  const pinOk = await verifySecret(pin, driver?.pinHash ?? DUMMY_HASH);

  if (!driver || !driver.active || !pinOk) {
    return Response.json({ error: "Invalid employee code or PIN" }, { status: 401 });
  }

  await clearAttempts(key);
  const token = await signSession({ sub: driver.id, role: "DRIVER", name: driver.name, tokenVersion: driver.tokenVersion });
  return Response.json({ token, name: driver.name, role: "DRIVER", driverId: driver.id });
}
