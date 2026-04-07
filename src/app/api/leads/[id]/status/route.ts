import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, notifications } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

const validStatuses = ["new", "in_review", "approved", "declined", "forwarded", "on_hold"];

// PATCH — quick status change (from lead list row)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { status } = await req.json();

  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Get current lead for notification logic
  const [currentLead] = await db.select({ status: leads.status, assignedTo: leads.assignedTo })
    .from(leads).where(eq(leads.id, leadId)).limit(1);

  if (!currentLead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  await db.update(leads).set({
    status: status as any,
    updatedAt: new Date(),
  }).where(eq(leads.id, leadId));

  // Notify assigned user if status changed to forwarded
  if (status === "forwarded" && currentLead.assignedTo) {
    await db.insert(notifications).values({
      userId: currentLead.assignedTo,
      type: "lead_updated",
      leadId,
      message: `Lead status changed to forwarded by ${user.fullName}`,
      url: `/leads/${leadId}`,
    });
  }

  await audit(user.id, user.username, "quick_status", "lead", leadId, `Status: ${currentLead.status} → ${status}`);

  return NextResponse.json({ success: true, oldStatus: currentLead.status, newStatus: status });
}
