import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { InvoiceDocument } from "@/lib/pdf/InvoiceDocument";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(req, ["ADMIN", "ACCOUNTANT"]);
  if ("error" in auth) return auth.error;

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { business: true, lineItems: true },
  });
  if (!invoice) return Response.json({ error: "Not found" }, { status: 404 });

  const buffer = await renderToBuffer(
    InvoiceDocument({
      invoiceNumber: invoice.invoiceNumber,
      businessName: invoice.business.name,
      businessAddress: invoice.business.address,
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: invoice.periodEnd.toISOString(),
      generatedAt: invoice.generatedAt.toISOString(),
      totalAmount: invoice.totalAmount,
      lineItems: invoice.lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        rate: li.rate,
        amount: li.amount,
      })),
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
