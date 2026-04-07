import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, collabEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// PATCH — autosave a single field on a lead (called on blur)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { field, value } = await req.json();

  if (!field) {
    return NextResponse.json({ error: "field is required" }, { status: 400 });
  }

  // Whitelist of fields that can be autosaved
  const allowedFields = new Set([
    "firstName", "lastName", "email", "phone", "landline", "dob", "ssnLast4",
    "mmn", "county", "vpass", "address", "city", "state", "zip", "country",
    "annualIncome", "employmentStatus", "creditScoreRange", "requestedLimit",
    "cardType", "cardNumberBin", "cardBrand", "cardIssuer",
    "businessName", "businessEin", "mortgageBank", "mortgagePayment",
    "status", "notes", "processorNotes",
  ]);

  if (!allowedFields.has(field)) {
    return NextResponse.json({ error: "Field not allowed" }, { status: 400 });
  }

  // Clean phone fields
  let cleanValue = value || null;
  if ((field === "phone" || field === "landline") && cleanValue) {
    cleanValue = cleanValue.replace(/\D/g, "");
  }

  // Update the field
  await db.update(leads).set({ [field]: cleanValue, updatedAt: new Date() }).where(eq(leads.id, leadId));

  // Log collab event (for real-time collaboration display)
  await db.insert(collabEvents).values({
    leadId,
    userId: user.id,
    userName: user.fullName,
    userRole: user.role,
    field,
    value: typeof cleanValue === "string" ? cleanValue : JSON.stringify(cleanValue),
  });

  return NextResponse.json({ success: true, field, value: cleanValue });
}
