import { requireAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Fetch app name from settings
  let appName = "Cyborg CRM";
  try {
    const [setting] = await db.select({ value: appSettings.value })
      .from(appSettings).where(eq(appSettings.key, "app_name")).limit(1);
    if (setting?.value) appName = setting.value;
  } catch {}

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} appName={appName} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <PresenceHeartbeat />
    </div>
  );
}
