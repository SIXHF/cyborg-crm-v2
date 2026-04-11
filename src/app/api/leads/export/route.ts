import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq, ilike, and, gte, lte, or, sql, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role === "agent") return NextResponse.json({ error: "Agents cannot export leads" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const ids = searchParams.get("ids");
    const q = searchParams.get("q");
    const status = searchParams.get("status");
    const agent = searchParams.get("agent");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const importRef = searchParams.get("import_ref");

    // Build conditions
    const conditions: any[] = [];

    // Export specific leads by ID (from batch selection)
    if (ids) {
      const idList = ids.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (idList.length > 0) {
        conditions.push(inArray(leads.id, idList));
      }
    }

    if (q) {
      conditions.push(
        or(
          ilike(leads.firstName, `%${q}%`),
          ilike(leads.lastName, `%${q}%`),
          ilike(leads.email, `%${q}%`),
          ilike(leads.phone, `%${q}%`),
          ilike(leads.refNumber, `%${q}%`),
        ),
      );
    }

    if (status) conditions.push(eq(leads.status, status as any));
    if (agent) conditions.push(eq(leads.agentId, parseInt(agent)));
    if (from) conditions.push(gte(leads.createdAt, new Date(from)));
    if (to) conditions.push(lte(leads.createdAt, new Date(to)));
    if (importRef) conditions.push(eq(leads.importRef, importRef));

    const rows = await db
      .select({
        refNumber: leads.refNumber,
        firstName: leads.firstName,
        lastName: leads.lastName,
        email: leads.email,
        phone: leads.phone,
        status: leads.status,
        state: leads.state,
        city: leads.city,
        zip: leads.zip,
        cardBrand: leads.cardBrand,
        cardIssuer: leads.cardIssuer,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(leads.createdAt)
      .limit(500000); // Cap at 500K rows to prevent memory exhaustion

    // Build CSV
    const columns = [
      "ref_number", "first_name", "last_name", "email", "phone",
      "status", "state", "city", "zip", "card_brand", "card_issuer", "created_at",
    ];

    const escapeCSV = (val: any): string => {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    let csv = columns.join(",") + "\n";

    for (const row of rows) {
      csv += [
        escapeCSV(row.refNumber),
        escapeCSV(row.firstName),
        escapeCSV(row.lastName),
        escapeCSV(row.email),
        escapeCSV(row.phone),
        escapeCSV(row.status),
        escapeCSV(row.state),
        escapeCSV(row.city),
        escapeCSV(row.zip),
        escapeCSV(row.cardBrand),
        escapeCSV(row.cardIssuer),
        escapeCSV(row.createdAt?.toISOString()),
      ].join(",") + "\n";
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
