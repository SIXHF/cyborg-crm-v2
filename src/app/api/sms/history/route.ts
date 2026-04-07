import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { smsLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("leadId");
    const phone = searchParams.get("phone");

    if (!leadId && !phone) {
      return NextResponse.json({ error: "leadId or phone query param required" }, { status: 400 });
    }

    const condition = leadId
      ? eq(smsLog.leadId, parseInt(leadId))
      : eq(smsLog.phone, phone!);

    const records = await db
      .select()
      .from(smsLog)
      .where(condition)
      .orderBy(desc(smsLog.createdAt))
      .limit(100);

    return NextResponse.json(records);
  } catch (error) {
    console.error("SMS history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
