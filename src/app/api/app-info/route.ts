import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET — public endpoint returning app name (no auth required)
export async function GET() {
  try {
    const [setting] = await db.select({ value: appSettings.value })
      .from(appSettings).where(eq(appSettings.key, "app_name")).limit(1);
    return NextResponse.json({ appName: setting?.value || "Cyborg CRM" });
  } catch {
    return NextResponse.json({ appName: "Cyborg CRM" });
  }
}
