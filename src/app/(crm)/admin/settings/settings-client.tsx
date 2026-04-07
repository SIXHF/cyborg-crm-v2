"use client";

import { useState } from "react";
import { Settings, Save, CheckCircle2 } from "lucide-react";

interface SettingField {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}

const sections: { title: string; icon: React.ReactNode; fields: SettingField[] }[] = [
  {
    title: "General Settings",
    icon: <Settings className="w-4 h-4" />,
    fields: [
      { key: "app_name", label: "App Name", placeholder: "Cyborg CRM" },
      { key: "app_timezone", label: "Timezone", placeholder: "America/New_York" },
      { key: "session_lifetime", label: "Session Lifetime (seconds)", placeholder: "3600", type: "number" },
    ],
  },
  {
    title: "SMS Settings (SkyTelecom)",
    icon: null,
    fields: [
      { key: "sms_api_key", label: "API Key", placeholder: "Bearer token", type: "password" },
      { key: "sms_sender_id", label: "Sender ID", placeholder: "SkyTelecom" },
    ],
  },
  {
    title: "Integrations",
    icon: null,
    fields: [
      { key: "bin_lookup_enabled", label: "BIN Lookup Enabled", placeholder: "true or false" },
      { key: "carrier_lookup_enabled", label: "Carrier Lookup Enabled", placeholder: "true or false" },
    ],
  },
];

export function SettingsClient({ initialSettings }: { initialSettings: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function updateValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: values }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, text: "Settings saved successfully!" });
      } else {
        setResult({ ok: false, text: data.error || "Failed to save settings" });
      }
    } catch {
      setResult({ ok: false, text: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {sections.map((section) => (
        <div key={section.title} className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            {section.icon}
            {section.title}
          </h3>
          <div className="space-y-4">
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {field.label}
                </label>
                <input
                  type={field.type || "text"}
                  value={values[field.key] || ""}
                  onChange={(e) => updateValue(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full h-9 px-3 bg-muted border border-border rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {result && (
        <div
          className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl ${
            result.ok
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : "bg-red-500/10 text-red-500 border border-red-500/20"
          }`}
        >
          {result.ok && <CheckCircle2 className="w-4 h-4" />}
          {result.text}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="h-10 px-6 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}
