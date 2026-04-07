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

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
