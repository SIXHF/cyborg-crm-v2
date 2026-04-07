import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuth(["admin"]);

  const settings = await db.select().from(appSettings);
  const settingsMap: Record<string, string> = {};
  settings.forEach((s) => { settingsMap[s.key] = s.value || ""; });

  return (
    <>
      <Topbar title="Settings" user={user} />
      <SettingsClient initialSettings={settingsMap} />
    </>
  );
}
