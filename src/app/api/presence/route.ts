import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { userPresence, users } from "@/lib/db/schema";
import { eq, gte, sql, desc } from "drizzle-orm";

// POST — update current user's presence (called from layout on every page)
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { module, action, leadId, leadName, pageUrl } = await req.json();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    // Upsert presence (one row per user)
    await db.execute(sql`
      INSERT INTO user_presence (user_id, module, action, lead_id, lead_name, last_seen, page_url, ip, session_start)
      VALUES (${user.id}, ${module || null}, ${action || null}, ${leadId || null}, ${leadName || null}, NOW(), ${pageUrl || null}, ${ip}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        module = EXCLUDED.module,
        action = EXCLUDED.action,
        lead_id = EXCLUDED.lead_id,
        lead_name = EXCLUDED.lead_name,
        last_seen = NOW(),
        page_url = EXCLUDED.page_url,
        ip = EXCLUDED.ip
    `);
  } catch {}

  return NextResponse.json({ ok: true });
}

// GET — get online users (active in last 90 seconds)
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoff = new Date(Date.now() - 90 * 1000);
  const online = await db
    .select({
      userId: userPresence.userId,
      fullName: users.fullName,
      role: users.role,
      module: userPresence.module,
      action: userPresence.action,
      leadId: userPresence.leadId,
      leadName: userPresence.leadName,
      lastSeen: userPresence.lastSeen,
      pageUrl: userPresence.pageUrl,
    })
    .from(userPresence)
    .innerJoin(users, eq(userPresence.userId, users.id))
    .where(gte(userPresence.lastSeen, cutoff))
    .orderBy(desc(userPresence.lastSeen));

  return NextResponse.json(online);
}
