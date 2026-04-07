import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  leads, leadCards, leadCosigners, leadEmployers, leadVehicles,
  leadRelatives, leadAddresses, leadEmails, leadLicenses,
  leadComments, leadAttachments, leadFollowups, leadViews,
  callQueue, callLog, collabEvents,
} from "@/lib/db/schema";
import { inArray, eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user.role !== "admin" && user.role !== "processor") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { ids, action, value } = await req.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    if (!["update_status", "reassign", "delete"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

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
      if (!value) return NextResponse.json({ error: "value is required for reassign" }, { status: 400 });
      await db
        .update(leads)
        .set({ agentId: parseInt(value), updatedAt: new Date() })
        .where(inArray(leads.id, leadIds));

      await audit(
        user.id, user.username, "batch_reassign", "lead", undefined,
        `Reassigned ${leadIds.length} leads to agent ${value}`,
      );
    } else if (action === "delete") {
      // Delete child tables first
      const childTables = [
        leadCards, leadCosigners, leadEmployers, leadVehicles,
        leadRelatives, leadAddresses, leadEmails, leadLicenses,
        leadComments, leadAttachments, leadFollowups, leadViews,
        callQueue, callLog, collabEvents,
      ];

      for (const table of childTables) {
        try {
          await db.delete(table).where(inArray((table as any).leadId, leadIds));
        } catch { /* table may not have matching rows */ }
      }

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
