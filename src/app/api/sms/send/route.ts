import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { smsLog, appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { leadId, phone, message } = await req.json();

    if (!phone || !message) {
      return NextResponse.json({ error: "phone and message are required" }, { status: 400 });
    }

    // Get API key from app_settings — no hardcoded fallback
    const [setting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, "sms_api_key"))
      .limit(1);

    const apiKey = setting?.value;
    if (!apiKey) {
      return NextResponse.json({ error: "SMS API key not configured. Set 'sms_api_key' in Admin > Settings." }, { status: 500 });
    }

    // Send via SkyTelecom API
    const response = await fetch("https://skytelecom.io/api/sms/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ to: phone, message }),
    });

    const result = await response.json();

    // Log to sms_log
    const [log] = await db.insert(smsLog).values({
      leadId: leadId ? parseInt(leadId) : null,
      userId: user.id,
      phone,
      message,
      direction: "outbound",
      status: response.ok ? "sent" : "failed",
      provider: "skytelecom",
      providerMessageId: result?.id?.toString() || result?.message_id || null,
    }).returning({ id: smsLog.id });

    await audit(
      user.id,
      user.username,
      "send_sms",
      "sms",
      log.id,
      `SMS to ${phone}${leadId ? ` (lead ${leadId})` : ""}`,
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "SMS send failed", details: result },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, id: log.id, result });
  } catch (error) {
    console.error("SMS send error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
