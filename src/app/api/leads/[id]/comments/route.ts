import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadComments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { body, isPrivate } = await req.json();

  if (!body?.trim()) {
    return NextResponse.json({ error: "Comment body required" }, { status: 400 });
  }

  const [comment] = await db.insert(leadComments).values({
    leadId,
    userId: user.id,
    body: body.trim(),
    isPrivate: isPrivate || false,
  }).returning();

  return NextResponse.json({ success: true, comment });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);

  const comments = await db
    .select()
    .from(leadComments)
    .where(eq(leadComments.leadId, leadId))
    .orderBy(desc(leadComments.createdAt));

  return NextResponse.json(comments);
}
