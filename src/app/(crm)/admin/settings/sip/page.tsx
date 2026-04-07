import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { inArray } from "drizzle-orm";
import { Phone, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

const SIP_KEYS = ["twilio_account_sid", "twilio_auth_token", "twilio_app_sid"];

function maskSecret(value: string | null): string {
  if (!value) return "Not configured";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

export default async function SipSettingsPage() {
  const user = await requireAuth(["admin"]);

  const settings = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, SIP_KEYS));

  const settingsMap: Record<string, string | null> = {};
  settings.forEach((s) => {
    settingsMap[s.key] = s.value;
  });

  const fields = [
    { key: "twilio_account_sid", label: "Twilio Account SID", masked: false },
    { key: "twilio_auth_token", label: "Twilio Auth Token", masked: true },
    { key: "twilio_app_sid", label: "Twilio App SID", masked: false },
  ];

  return (
    <>
      <Topbar title="SIP Settings" user={user} />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">SIP / Twilio Configuration</h2>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl">
          <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
            <Lock className="w-4 h-4" />
            <span>Read-only view. Contact a system administrator to update these values.</span>
          </div>

          <div className="space-y-5">
            {fields.map((field) => {
              const rawValue = settingsMap[field.key] ?? null;
              const displayValue = field.masked ? maskSecret(rawValue) : (rawValue || "Not configured");
              const isConfigured = !!rawValue;

              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    {field.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={displayValue}
                      className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground cursor-not-allowed"
                    />
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                        isConfigured
                          ? "bg-green-500/10 text-green-500"
                          : "bg-yellow-500/10 text-yellow-500"
                      }`}
                    >
                      {isConfigured ? "Set" : "Missing"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
