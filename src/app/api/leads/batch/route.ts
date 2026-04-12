import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";

const batchSchema = z.object({
  ids: z.array(z.number().or(z.string())).min(1).max(10000),
  action: z.enum(["update_status", "reassign", "delete"]),
  value: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user.role !== "admin" && user.role !== "processor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rawBody = await req.json();
    const parsed = batchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { ids, action, value } = parsed.data;

    const leadIds = ids.map((id: any) => parseInt(id));

    if (action === "update_status") {
      const validStatuses = ["new", "in_review", "approved", "declined", "forwarded", "on_hold"];
      if (!value || !validStatuses.includes(value)) return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      await db
        .update(leads)
        .set({ status: value as any, updatedAt: new Date() })
        .where(inArray(leads.id, leadIds));

      await audit(
        user.id, user.username, "batch_update_status", "lead", undefined,
        `Updated ${leadIds.length} leads to status: ${value}`,
      );
    } else if (action === "reassign") {
      // value === "null" or empty means unassign
      const isUnassign = !value || value === "null";
      if (!isUnassign && (isNaN(parseInt(value!)) || parseInt(value!) <= 0)) {
        return NextResponse.json({ error: "Invalid agent id" }, { status: 400 });
      }
      const agentId = isUnassign ? null : parseInt(value!);
      if (isUnassign) {
        // Clear BOTH agentId AND assignedTo so leads disappear from agents
        // with "assigned" visibility (who see leads where assignedTo = user.id).
        await db
          .update(leads)
          .set({ agentId: null, assignedTo: null, updatedAt: new Date() })
          .where(inArray(leads.id, leadIds));
      } else {
        // Reassign: update agentId only (matches v1 behavior). assignedTo is a
        // separate handoff field and should not be overwritten here.
        await db
          .update(leads)
          .set({ agentId, updatedAt: new Date() })
          .where(inArray(leads.id, leadIds));
      }

      await audit(
        user.id, user.username, "batch_reassign", "lead", undefined,
        isUnassign
          ? `Unassigned ${leadIds.length} leads`
          : `Reassigned ${leadIds.length} leads to agent ${value}`,
      );
    } else if (action === "delete") {
      // Delete leads directly — CASCADE foreign keys handle child tables
      await db.delete(leads).where(inArray(leads.id, leadIds));

      await audit(
        user.id, user.username, "batch_delete", "lead", undefined,
        `Deleted ${leadIds.length} leads: ${leadIds.join(", ")}`,
      );
    }

    return NextResponse.json({ success: true, count: leadIds.length });
  } catch (error) {
    console.error("Batch action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
