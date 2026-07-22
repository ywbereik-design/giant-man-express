import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const encoder = new TextEncoder();

// A real bcrypt hash with no known plaintext, computed once at startup. Used to
// run a "compare" against when a login identifier isn't found, so lookup and
// wrong-password cases take roughly the same amount of time (avoids leaking
// which emails / employee codes exist via response timing).
export const DUMMY_HASH = bcrypt.hashSync("no-such-account-placeholder", 10);

const PLACEHOLDER_SECRET = "change-this-to-a-long-random-string-before-going-to-production";
let warnedAboutPlaceholderSecret = false;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  if (secret === PLACEHOLDER_SECRET && !warnedAboutPlaceholderSecret) {
    warnedAboutPlaceholderSecret = true;
    console.warn(
      "\n⚠️  JWT_SECRET is still the default placeholder value from .env.\n" +
        "   Anyone with this repo's source can forge admin/driver login tokens.\n" +
        "   Set a long random JWT_SECRET before deploying anywhere real — see DEPLOY.md.\n"
    );
  }
  return encoder.encode(secret);
}

export type Role = "ADMIN" | "DISPATCH" | "DRIVER";

export interface SessionPayload {
  sub: string;
  role: Role;
  name: string;
  [key: string]: unknown;
}

export async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, 10);
}

export async function verifySecret(value: string, hash: string): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return verifySession(token);
}

export async function requireRole(
  req: NextRequest,
  role: Role | Role[]
): Promise<{ session: SessionPayload } | { error: Response }> {
  const allowed = Array.isArray(role) ? role : [role];
  const session = await getSessionFromRequest(req);
  if (!session) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // A staff member's role can change (or their account can be deactivated or
  // deleted) after their token was issued, and tokens stay valid for up to 30
  // days — so for ADMIN/DISPATCH sessions, re-check the *current* role and
  // active status in the database rather than trusting the JWT's claims.
  // Without this, a demoted, deactivated, or deleted staff member's existing
  // token would keep working until it expired.
  let currentSession = session;
  if (session.role === "ADMIN" || session.role === "DISPATCH") {
    const staff = await prisma.staffUser.findUnique({
      where: { id: session.sub },
      select: { role: true, active: true },
    });
    if (!staff || !staff.active) {
      return { error: Response.json({ error: "This account is no longer active" }, { status: 401 }) };
    }
    currentSession = { ...session, role: staff.role as Role };
  }

  if (!allowed.includes(currentSession.role)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session: currentSession };
}

// Like requireRole(req, "DRIVER"), but also re-checks the driver is still
// active in the database — a driver's existing token stays cryptographically
// valid for up to 30 days, so deactivating them in the admin app must be
// checked here too, not just at login time.
export async function requireActiveDriver(
  req: NextRequest
): Promise<{ session: SessionPayload } | { error: Response }> {
  const auth = await requireRole(req, "DRIVER");
  if ("error" in auth) return auth;

  const driver = await prisma.driver.findUnique({
    where: { id: auth.session.sub },
    select: { active: true },
  });
  if (!driver || !driver.active) {
    return { error: Response.json({ error: "This driver account is no longer active" }, { status: 403 }) };
  }
  return auth;
}
