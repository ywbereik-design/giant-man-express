import { NextRequest } from "next/server";
import { ZodSchema } from "zod";

export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>):
  Promise<{ data: T } | { error: Response }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: Response.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      error: Response.json(
        { error: "Validation failed", details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { data: result.data };
}

export function isError<T>(x: { data: T } | { error: Response }): x is { error: Response } {
  return "error" in x;
}
