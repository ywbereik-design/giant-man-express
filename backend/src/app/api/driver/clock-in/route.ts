import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireActiveDriver } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { IMAGE_DATA_URL_PATTERN, MAX_SELFIE_DATA_URL_LENGTH } from "@/lib/constants";

const schema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  selfie: z
    .string()
    .regex(IMAGE_DATA_URL_PATTERN, "selfie must be a JPEG or PNG image data URL")
    .max(MAX_SELFIE_DATA_URL_LENGTH, "Photo is too large"),
});

export async function POST(req: NextRequest) {
  const auth = await requireActiveDriver(req);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, schema);
  if (isError(body)) return body.error;

  // Fast-path check for the common case — but not the actual correctness
  // guarantee: two clock-ins fired at nearly the same instant could both
  // read "no open entry" here before either write lands. The DB-level
  // partial unique index (TimeEntry_driverId_open_shift_key — see the
  // migration and the schema.prisma comment on TimeEntry) is what actually
  // prevents two open shifts for one driver; the catch below turns that
  // constraint violation into the same clean 409 this route already returns.
  const open = await prisma.timeEntry.findFirst({
    where: { driverId: auth.session.sub, clockOutAt: null },
  });
  if (open) {
    return Response.json({ error: "Already clocked in" }, { status: 409 });
  }

  try {
    const entry = await prisma.timeEntry.create({
      data: {
        driverId: auth.session.sub,
        clockInAt: new Date(),
        clockInLat: body.data.lat,
        clockInLng: body.data.lng,
        clockInPhoto: body.data.selfie,
      },
    });
    return Response.json({ entry }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return Response.json({ error: "Already clocked in" }, { status: 409 });
    }
    throw err;
  }
}
