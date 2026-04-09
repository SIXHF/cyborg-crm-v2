import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { callLog, leads } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const callLogSchema = z.object({
  leadId: z.number(),
  outcome: z.enum(["picked_up", "no_answer", "voicemail", "callback", "wrong_number", "do_not_call"]),
  notes: z.string().optional(),
  callDuration: z.number().optional(),
  phoneDialed: z.string().optional(),
});

// POST — log a call outcome
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await req.json();
  const parsed = callLogSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { leadId, outcome, notes, callDuration, phoneDialed } = parsed.data;

  const [log] = await db.insert(callLog).values({
    leadId,
    agentId: user.id,
    outcome: outcome as any,
    notes: notes || null,
    callDuration: callDuration || null,
    phoneDialed: phoneDialed || null,
  }).returning({ id: callLog.id });

  // Update lead status based on outcome
  const statusMap: Record<string, string> = {
    picked_up: "in_review",
    do_not_call: "declined",
    callback: "on_hold",
  };

  if (statusMap[outcome]) {
    await db.update(leads).set({
      status: statusMap[outcome] as any,
      updatedAt: new Date(),
    }).where(eq(leads.id, leadId));
  }

  await audit(user.id, user.username, "call_logged", "lead", leadId, `Outcome: ${outcome}`);

  return NextResponse.json({ success: true, id: log.id });
}
