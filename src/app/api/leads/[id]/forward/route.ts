import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, users, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST — forward lead to a processor/admin
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { toUserId, notes } = await req.json();

  if (!toUserId) {
    return NextResponse.json({ error: "toUserId is required" }, { status: 400 });
  }

  // Verify target user exists and is active
  const [targetUser] = await db.select({ id: users.id, fullName: users.fullName, role: users.role })
    .from(users).where(eq(users.id, parseInt(toUserId))).limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  // Update lead: set status to forwarded, assign to target user
  await db.update(leads).set({
    status: "forwarded",
    assignedTo: targetUser.id,
    processorNotes: notes || null,
    updatedAt: new Date(),
  }).where(eq(leads.id, leadId));

  // Create notification for the target user
  await db.insert(notifications).values({
    userId: targetUser.id,
    type: "lead_assigned",
    leadId,
    message: `Lead forwarded to you by ${user.fullName}${notes ? `: ${notes}` : ""}`,
    url: `/leads/${leadId}`,
  });

  await audit(user.id, user.username, "forward_lead", "lead", leadId,
    `Forwarded to ${targetUser.fullName} (${targetUser.role})`);

  return NextResponse.json({ success: true });
}
