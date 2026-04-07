import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callQueue, leads } from "@/lib/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";

// GET — fetch agent's call queue
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const queue = await db
    .select({
      id: callQueue.id,
      leadId: callQueue.leadId,
      sortOrder: callQueue.sortOrder,
      addedAt: callQueue.addedAt,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      email: leads.email,
      status: leads.status,
      state: leads.state,
      refNumber: leads.refNumber,
    })
    .from(callQueue)
    .innerJoin(leads, eq(callQueue.leadId, leads.id))
    .where(eq(callQueue.agentId, user.id))
    .orderBy(asc(callQueue.sortOrder));

  return NextResponse.json(queue);
}

// POST — add lead to queue
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await req.json();
  if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  // Get max sort order
  const [maxOrder] = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
    .from(callQueue)
    .where(eq(callQueue.agentId, user.id));

  try {
    await db.insert(callQueue).values({
      leadId,
      agentId: user.id,
      sortOrder: (maxOrder?.max || 0) + 1,
    });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e.message?.includes("duplicate") || e.message?.includes("unique")) {
      return NextResponse.json({ error: "Lead already in queue" }, { status: 409 });
    }
    throw e;
  }
}

// DELETE — remove lead from queue
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId, clearAll } = await req.json();

  if (clearAll) {
    await db.delete(callQueue).where(eq(callQueue.agentId, user.id));
  } else if (leadId) {
    await db.delete(callQueue).where(
      and(eq(callQueue.agentId, user.id), eq(callQueue.leadId, leadId))
    );
  }

  return NextResponse.json({ success: true });
}
