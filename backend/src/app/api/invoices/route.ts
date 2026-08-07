import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseBody, isError } from "@/lib/api";
import { nextNumber } from "@/lib/numbering";
import { runOrRespond, isResponse } from "@/lib/dbErrors";
import { parsePaginationParams, buildPage } from "@/lib/pagination";
import { MAX_BILLING_PERIOD_DAYS } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("businessId");
  const { cursor, limit } = parsePaginationParams(searchParams, 100, 100);

  const rows = await prisma.invoice.findMany({
    where: businessId ? { businessId } : {},
    orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
    include: { business: { select: { name: true } } },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const { items, nextCursor } = buildPage(rows, limit);
  return Response.json({ invoices: items, nextCursor });
}

const createSchema = z
  .object({
    businessId: z.string().min(1),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
  })
  .refine((data) => new Date(data.periodStart) < new Date(data.periodEnd), {
    message: "periodStart must be before periodEnd",
    path: ["periodEnd"],
  })
  // Without this, an unbounded range pulls every un-invoiced delivered job
  // for the business into one query with no limit — a caller-controlled
  // resource-exhaustion vector, not just a UX nuisance.
  .refine(
    (data) => new Date(data.periodEnd).getTime() - new Date(data.periodStart).getTime() <= MAX_BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    { message: `The billing period can't span more than ${MAX_BILLING_PERIOD_DAYS} days`, path: ["periodEnd"] }
  );

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const body = await parseBody(req, createSchema);
  if (isError(body)) return body.error;
  const { businessId, periodStart, periodEnd } = body.data;

  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return Response.json({ error: "Business not found" }, { status: 404 });

  if (business.billingRate == null) {
    return Response.json(
      { error: "Set a billing rate for this business before generating an invoice" },
      { status: 400 }
    );
  }

  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  const jobs = await prisma.job.findMany({
    where: {
      businessId,
      status: "DELIVERED",
      deliveredAt: { gte: start, lt: end },
      // Never bill the same delivered job on two different invoices.
      invoiceLineItems: { none: {} },
    },
    include: { jobType: true },
    orderBy: { deliveredAt: "asc" },
  });

  if (jobs.length === 0) {
    return Response.json(
      { error: "No un-invoiced delivered jobs for this business in the selected period" },
      { status: 400 }
    );
  }

  const rate = business.billingRate;
  const lineItemsData = jobs.map((job) => ({
    jobId: job.id,
    description: `${job.jobType.name} — ${job.title} (${job.deliveredAt!.toLocaleDateString("en-CA")})`,
    quantity: 1,
    rate,
    amount: rate,
  }));
  const totalAmount = lineItemsData.reduce((sum, li) => sum + li.amount, 0);

  // The `invoiceLineItems: { none: {} }` filter above handles the common
  // sequential case; the @@unique([jobId]) constraint on InvoiceLineItem is
  // the backstop for two concurrent requests both reading the same
  // "un-invoiced" jobs before either commits — runOrRespond turns the
  // resulting P2002 into a clean 409 instead of an unhandled 500, and
  // instead of silently double-billing one of these jobs. The number
  // increment and the row insert share one transaction so a collision
  // rolls both back together instead of burning an invoice number on a
  // request that never produced an invoice.
  const result = await runOrRespond(() =>
    prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextNumber("INV", "invoice", tx);
      return tx.invoice.create({
        data: {
          invoiceNumber,
          businessId,
          periodStart: start,
          periodEnd: end,
          totalAmount,
          lineItems: { create: lineItemsData },
        },
        include: { business: true, lineItems: true },
      });
    })
  );
  if (isResponse(result)) return result;

  return Response.json({ invoice: result }, { status: 201 });
}
