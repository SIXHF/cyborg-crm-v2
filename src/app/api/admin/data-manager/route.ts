import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, leadCosigners, leadEmployers, leadVehicles, leadRelatives, leadAddresses, leadEmails, leadLicenses, leadComments, leadAttachments, leadFollowups, leadViews, callQueue, callLog, collabEvents } from "@/lib/db/schema";
import { eq, sql, and, lt, inArray } from "drizzle-orm";

const BATCH = 5000;

const CHILD_TABLES = [
  leadCards, leadCosigners, leadEmployers, leadVehicles, leadRelatives,
  leadAddresses, leadEmails, leadLicenses, leadComments, leadAttachments,
  leadFollowups, leadViews, callQueue, callLog, collabEvents,
];

async function batchDeleteIds(ids: number[]) {
  if (!ids.length) return 0;
  // Delete from child tables
  for (const table of CHILD_TABLES) {
    try {
      await db.delete(table).where(inArray((table as any).leadId, ids));
    } catch {}
  }
  // Delete leads
  await db.delete(leads).where(inArray(leads.id, ids));
  return ids.length;
}

async function batchDeleteWhere(where: any): Promise<{ deleted: number; remaining: number }> {
  const ids = await db.select({ id: leads.id }).from(leads).where(where).limit(BATCH);
  if (!ids.length) return { deleted: 0, remaining: 0 };

  const deleted = await batchDeleteIds(ids.map((r) => r.id));

  // Check if more remain
  if (ids.length >= BATCH) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(where);
    return { deleted, remaining: count };
  }
  return { deleted, remaining: 0 };
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case "delete_all": {
        const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(leads);
        if (count === 0) return NextResponse.json({ done: true, deleted: 0, remaining: 0 });

        // TRUNCATE — instant, no transaction wrapper
        for (const table of CHILD_TABLES) {
          try { await db.execute(sql`TRUNCATE TABLE ${sql.identifier((table as any)[Symbol.for("drizzle:Name")])} CASCADE`); } catch {}
        }
        await db.execute(sql`TRUNCATE TABLE leads CASCADE`);
        await audit(user.id, user.username, "data_manager", "admin", undefined, `Truncated ALL leads (${count} total)`);
        return NextResponse.json({ done: true, deleted: count, remaining: 0 });
      }

      case "delete_by_status": {
        const result = await batchDeleteWhere(eq(leads.status, body.status));
        if (result.deleted && result.remaining === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, `Deleted leads with status: ${body.status}`);
        }
        return NextResponse.json({ done: result.remaining === 0, ...result });
      }

      case "delete_by_import_ref": {
        const result = await batchDeleteWhere(eq(leads.importRef, body.importRef));
        if (result.deleted && result.remaining === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, `Deleted leads with import_ref: ${body.importRef}`);
        }
        return NextResponse.json({ done: result.remaining === 0, ...result });
      }

      case "delete_duplicates": {
        // Find duplicate phones, keep newest (max id)
        const dupes = await db.execute(sql`
          SELECT l.id FROM leads l
          INNER JOIN (
            SELECT phone, MAX(id) as keep_id FROM leads
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone HAVING COUNT(*) > 1
          ) d ON l.phone = d.phone
          WHERE l.id != d.keep_id
          LIMIT ${BATCH}
        `);

        const ids = (dupes as any[]).map((r: any) => r.id);
        const deleted = await batchDeleteIds(ids);

        // Check remaining
        const [remaining] = await db.execute(sql`
          SELECT COUNT(*) as cnt FROM leads l
          INNER JOIN (
            SELECT phone, MAX(id) as keep_id FROM leads
            WHERE phone IS NOT NULL AND phone != ''
            GROUP BY phone HAVING COUNT(*) > 1
          ) d ON l.phone = d.phone
          WHERE l.id != d.keep_id
        `);

        const rem = (remaining as any)?.cnt || 0;
        if (deleted && rem === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, "Deleted duplicate leads");
        }
        return NextResponse.json({ done: rem === 0, deleted, remaining: rem });
      }

      case "delete_by_age": {
        const days = parseInt(body.days);
        if (!days || days < 1) return NextResponse.json({ error: "Invalid days value" }, { status: 400 });
        const result = await batchDeleteWhere(
          sql`${leads.createdAt} < NOW() - INTERVAL '${sql.raw(String(days))} days'`
        );
        if (result.deleted && result.remaining === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, `Deleted leads older than ${days} days`);
        }
        return NextResponse.json({ done: result.remaining === 0, ...result });
      }

      case "delete_by_agent": {
        const agentId = parseInt(body.agentId);
        if (!agentId) return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
        const result = await batchDeleteWhere(eq(leads.agentId, agentId));
        if (result.deleted && result.remaining === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, `Deleted leads for agent_id: ${agentId}`);
        }
        return NextResponse.json({ done: result.remaining === 0, ...result });
      }

      case "delete_by_ref_numbers": {
        const refs = (body.refNumbers as string || "")
          .split(/[,\n\r]+/)
          .map((r: string) => r.trim())
          .filter((r: string) => r.length > 0);
        if (!refs.length) return NextResponse.json({ error: "No ref numbers provided" }, { status: 400 });
        const result = await batchDeleteWhere(inArray(leads.refNumber, refs));
        if (result.deleted && result.remaining === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, `Deleted ${result.deleted} leads by ref numbers`);
        }
        return NextResponse.json({ done: result.remaining === 0, ...result });
      }

      case "remove_bad_phones": {
        const result = await batchDeleteWhere(
          sql`${leads.phone} IS NOT NULL AND ${leads.phone} != '' AND (LENGTH(${leads.phone}) < 10 OR LENGTH(${leads.phone}) > 15)`
        );
        if (result.deleted && result.remaining === 0) {
          await audit(user.id, user.username, "data_manager", "admin", undefined, `Removed leads with bad phone numbers`);
        }
        return NextResponse.json({ done: result.remaining === 0, ...result });
      }

      case "clear_bad_phones": {
        const updated = await db.execute(
          sql`UPDATE leads SET phone = NULL WHERE phone IS NOT NULL AND phone != '' AND (LENGTH(phone) < 10 OR LENGTH(phone) > 15)`
        );
        const count = (updated as any)?.rowCount || (updated as any)?.length || 0;
        await audit(user.id, user.username, "data_manager", "admin", undefined, `Cleared ${count} bad phone numbers`);
        return NextResponse.json({ done: true, deleted: count, remaining: 0 });
      }

      case "reset_scores": {
        const updated = await db.execute(
          sql`UPDATE leads SET lead_score = 0 WHERE lead_score IS NOT NULL AND lead_score != 0`
        );
        const count = (updated as any)?.rowCount || (updated as any)?.length || 0;
        await audit(user.id, user.username, "data_manager", "admin", undefined, `Reset ${count} lead scores to 0`);
        return NextResponse.json({ done: true, deleted: count, remaining: 0 });
      }

      case "purge_audit": {
        await db.execute(sql`TRUNCATE TABLE audit_log`);
        return NextResponse.json({ done: true, deleted: 0, remaining: 0 });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
