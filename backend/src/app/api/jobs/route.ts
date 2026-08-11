import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { JOB_STATUSES, MAX_DROPOFF_STOPS, MAX_JOB_NOTES_LENGTH, MAX_JOB_TEXT_LENGTH, PHONE_PATTERN } from "@/lib/constants";
import { safeDriverSelect } from "@/lib/select";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { parsePaginationParams, buildPage } from "@/lib/pagination";

const JOB_INCLUDE = {
  jobType: true,
  driver: { select: safeDriverSelect },
  business: true,
  dropoffStops: { orderBy: { sequence: "asc" as const } },
};

// Used only by the list route below — deliberately a `select`, not the
// `include` above, so it can name every scalar field EXCEPT pickupPhoto/
// deliveryPhoto. Each can hold up to 3MB of base64 text; a full page of up
// to 200 delivered jobs with both photos populated could be well over 1GB
// in one response, for a list view that only needs status/title/driver/
// business summary info. GET /api/jobs/[id] is the single-job detail route
// that actually includes the photos, for when a specific job is opened.
const JOB_LIST_SELECT = {
  id: true,
  title: true,
  jobTypeId: true,
  jobType: true,
  driverId: true,
  driver: { select: safeDriverSelect },
  businessId: true,
  business: true,
  pickupAddress: true,
  notes: true,
  status: true,
  createdAt: true,
  dropoffStops: { orderBy: { sequence: "asc" as const } },
  acceptedAt: true,
  arrivedAt: true,
  pickedUpAt: true,
  onTheWayAt: true,
  deliveredAt: true,
  failedAt: true,
  pickupLat: true,
  pickupLng: true,
  deliveryLat: true,
  deliveryLng: true,
  failureReason: true,
} as const;

// ADMIN-only addition to the list select above — see the schema comment on
// Job.clientPhone for why Dispatch doesn't get this field at all, not even
// read-only.
const JOB_LIST_SELECT_ADMIN = { ...JOB_LIST_SELECT, clientPhone: true } as const;

export async function GET(req: NextRequest) {
  // Dispatch and admin both need full visibility into jobs — dispatching
  // and tracking jobs is dispatch's core function.
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const driverId = searchParams.get("driverId");
  const { cursor, limit } = parsePaginationParams(searchParams, 200, 200);

  const rows = await prisma.job.findMany({
    where: {
      ...(status && (JOB_STATUSES as readonly string[]).includes(status) ? { status } : {}),
      ...(driverId ? { driverId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: auth.session.role === "ADMIN" ? JOB_LIST_SELECT_ADMIN : JOB_LIST_SELECT,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const { items, nextCursor } = buildPage(rows, limit);
  return Response.json({ jobs: items, nextCursor });
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(MAX_JOB_TEXT_LENGTH),
  jobTypeId: z.string().min(1),
  driverId: z.string().min(1),
  businessId: z.string().min(1).optional(),
  pickupAddress: z.string().trim().max(MAX_JOB_TEXT_LENGTH).optional(),
  // Accepted from any requester at the schema level — restricted to
  // ADMIN-only actually being applied in the handler below, so a Dispatch
  // request that includes this is parsed fine but silently has no effect.
  clientPhone: z.union([z.string().trim().regex(PHONE_PATTERN, "Enter a valid phone number"), z.literal("")]).optional(),
  // One pickup, any number of delivery stops, in route order — capped so a
  // single job can't force an unbounded JobStop bulk-insert.
  dropoffAddresses: z.array(z.string().trim().min(1).max(MAX_JOB_TEXT_LENGTH)).max(MAX_DROPOFF_STOPS).optional(),
  notes: z.string().trim().max(MAX_JOB_NOTES_LENGTH).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "DISPATCH"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;
  const { jobTypeId, driverId, businessId, dropoffAddresses, clientPhone, ...jobData } = body.data;

  const [jobType, driver, business] = await Promise.all([
    prisma.jobType.findUnique({ where: { id: jobTypeId } }),
    prisma.driver.findUnique({ where: { id: driverId } }),
    businessId ? prisma.business.findUnique({ where: { id: businessId } }) : Promise.resolve(null),
  ]);

  if (!jobType || !jobType.active) {
    return Response.json({ error: "Select a valid, active job type" }, { status: 400 });
  }
  if (!driver || !driver.active) {
    return Response.json({ error: "Select a valid, active driver" }, { status: 400 });
  }
  if (businessId && !business) {
    return Response.json({ error: "Selected business does not exist" }, { status: 400 });
  }

  const result = await runOrRespond(() =>
    prisma.job.create({
      data: {
        ...jobData,
        jobTypeId,
        driverId,
        businessId,
        status: JOB_STATUSES[0],
        // Dispatch-submitted clientPhone (if any) is silently dropped, not
        // rejected — see the schema comment on Job.clientPhone.
        ...(auth.session.role === "ADMIN" && clientPhone ? { clientPhone } : {}),
        ...(dropoffAddresses?.length
          ? { dropoffStops: { create: dropoffAddresses.map((address, sequence) => ({ address, sequence })) } }
          : {}),
      },
      include: JOB_INCLUDE,
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ job: result }, { status: 201 });
}
