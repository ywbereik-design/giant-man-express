import { Prisma } from "@prisma/client";

// Wraps a Prisma write and converts common, expected error codes into clean
// JSON error responses instead of letting them bubble up as unhandled 500s.
//   P2025 - record to update/delete not found
//   P2002 - unique constraint violation
//   P2003 - foreign key constraint violation (references a row that doesn't exist)
export async function runOrRespond<T>(fn: () => Promise<T>): Promise<T | Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (err.code === "P2002") {
        const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : "field";
        return Response.json({ error: `That ${target} is already in use` }, { status: 409 });
      }
      if (err.code === "P2003") {
        return Response.json({ error: "One of the referenced records does not exist" }, { status: 400 });
      }
    }
    throw err;
  }
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}
