import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { Settings } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuth(["admin"]);

  const settings = await db.select().from(appSettings);
  const settingsMap: Record<string, string> = {};
  settings.forEach((s) => { settingsMap[s.key] = s.value || ""; });

  return (
    <>
      <Topbar title="Settings" user={user} />
      <div className="p-6 max-w-3xl space-y-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Settings className="w-4 h-4" />General Settings</h3>
          <div className="space-y-4">
            {[
              { key: "app_name", label: "App Name", placeholder: "Cyborg CRM" },
              { key: "app_timezone", label: "Timezone", placeholder: "America/New_York" },
              { key: "session_lifetime", label: "Session Lifetime (seconds)", placeholder: "3600" },
            ].map((setting) => (
              <div key={setting.key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{setting.label}</label>
                <input
                  type="text"
                  defaultValue={settingsMap[setting.key] || ""}
                  placeholder={setting.placeholder}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  readOnly
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">SMS Settings (SkyTelecom)</h3>
          <div className="space-y-4">
            {[
              { key: "sms_api_key", label: "API Key", placeholder: "Bearer token" },
              { key: "sms_sender_id", label: "Sender ID", placeholder: "SkyTelecom" },
            ].map((setting) => (
              <div key={setting.key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{setting.label}</label>
                <input
                  type="text"
                  defaultValue={settingsMap[setting.key] || ""}
                  placeholder={setting.placeholder}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                  readOnly
                />
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Settings are read-only in this preview. Full edit support coming soon.
        </p>
      </div>
    </>
  );
}
