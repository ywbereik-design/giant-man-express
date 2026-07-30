import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const encoder = new TextEncoder();

// A real bcrypt hash with no known plaintext, computed once at startup. Used to
// run a "compare" against when a login identifier isn't found, so lookup and
// wrong-password cases take roughly the same amount of time (avoids leaking
// which emails / employee codes exist via response timing).
const BCRYPT_COST = 12;

export const DUMMY_HASH = bcrypt.hashSync("no-such-account-placeholder", BCRYPT_COST);

const PLACEHOLDER_SECRET = "change-this-to-a-long-random-string-before-going-to-production";
let warnedAboutPlaceholderSecret = false;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  if (secret === PLACEHOLDER_SECRET) {
    // A placeholder secret means anyone with this repo's source can forge
    // admin/driver login tokens — refuse to even start a production
    // deployment on it, rather than merely warning and continuing.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "JWT_SECRET is still the default placeholder value — refusing to start in production. " +
          "Set a long random JWT_SECRET before deploying anywhere real — see DEPLOY.md."
      );
    }
    if (!warnedAboutPlaceholderSecret) {
      warnedAboutPlaceholderSecret = true;
      console.warn(
        "\n⚠️  JWT_SECRET is still the default placeholder value from .env.\n" +
          "   Anyone with this repo's source can forge admin/driver login tokens.\n" +
          "   Set a long random JWT_SECRET before deploying anywhere real — see DEPLOY.md.\n"
      );
    }
  }
  return encoder.encode(secret);
}

export type Role = "ADMIN" | "DISPATCH" | "ACCOUNTANT" | "DRIVER";

export interface SessionPayload {
  sub: string;
  role: Role;
  name: string;
  // Snapshot of the account's tokenVersion at sign time — bumped on every
  // password/PIN change so old tokens (including a stolen copy) stop
  // validating immediately instead of surviving for their full 30-day life.
  tokenVersion: number;
  [key: string]: unknown;
}

export async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, BCRYPT_COST);
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

async function verifySession(token: string): Promise<SessionPayload | null> {
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
  // days — so for every staff-backed role, re-check the *current* role and
  // active status in the database rather than trusting the JWT's claims.
  // Without this, a demoted, deactivated, or deleted staff member's existing
  // token would keep working until it expired.
  let currentSession = session;
  if (session.role === "ADMIN" || session.role === "DISPATCH" || session.role === "ACCOUNTANT") {
    const staff = await prisma.staffUser.findUnique({
      where: { id: session.sub },
      select: { role: true, active: true, tokenVersion: true },
    });
    if (!staff || !staff.active) {
      return { error: Response.json({ error: "This account is no longer active" }, { status: 401 }) };
    }
    // A password change bumps tokenVersion — any token signed before that
    // (including a stolen copy) no longer matches and is rejected here.
    if (staff.tokenVersion !== session.tokenVersion) {
      return {
        error: Response.json({ error: "Your session has expired. Please log in again." }, { status: 401 }),
      };
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
    select: { active: true, tokenVersion: true },
  });
  // 401, not 403: a deactivated account isn't "forbidden from this specific
  // resource" (403), it's "no longer a valid session" (401) — matching how
  // requireRole treats a deactivated staff account, so the mobile client's
  // 401-triggered forced-logout applies to drivers too instead of leaving a
  // deactivated driver stuck looking logged in.
  if (!driver || !driver.active) {
    return { error: Response.json({ error: "This driver account is no longer active" }, { status: 401 }) };
  }
  // A PIN change bumps tokenVersion — any token signed before that (including
  // a stolen copy) no longer matches and is rejected here.
  if (driver.tokenVersion !== auth.session.tokenVersion) {
    return {
      error: Response.json({ error: "Your session has expired. Please log in again." }, { status: 401 }),
    };
  }
  return auth;
}
