import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadFollowups } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// POST — create a new follow-up
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { dueAt, note } = await req.json();

  if (!dueAt) {
    return NextResponse.json({ error: "dueAt is required" }, { status: 400 });
  }

  const [followup] = await db.insert(leadFollowups).values({
    leadId,
    userId: user.id,
    dueAt: new Date(dueAt),
    note: note?.trim() || null,
    isDone: false,
  }).returning();

  return NextResponse.json({ success: true, followup });
}

// PATCH — mark follow-up as done
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: followupId, isDone } = await req.json();

  if (!followupId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await db
    .update(leadFollowups)
    .set({
      isDone: isDone !== false,
      completedAt: isDone !== false ? new Date() : null,
    })
    .where(eq(leadFollowups.id, parseInt(followupId)));

  return NextResponse.json({ success: true });
}
