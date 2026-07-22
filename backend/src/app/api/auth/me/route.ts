import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ id: session.sub, role: session.role, name: session.name });
}
