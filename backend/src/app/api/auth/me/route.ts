import { NextRequest } from "next/server";
import { getSessionFromRequest, requireRole, requireActiveDriver } from "@/lib/auth";

// Used by the mobile app to revalidate a restored session on app launch —
// so this must re-check the DB (active status, tokenVersion) exactly like
// every other authenticated route, not just decode the JWT. Reuses
// requireRole/requireActiveDriver rather than duplicating that logic.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const auth =
    session.role === "DRIVER" ? await requireActiveDriver(req) : await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  return Response.json({ id: auth.session.sub, role: auth.session.role, name: auth.session.name });
}
