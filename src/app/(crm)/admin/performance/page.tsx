import { requireAuth } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { Gauge } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const user = await requireAuth(["admin"]);

  return (
    <>
      <Topbar title="Performance" user={user} />
      <div className="p-6 space-y-6">
        <div className="bg-card border border-border rounded-xl p-16 text-center">
          <Gauge className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Performance Monitoring</h2>
          <p className="text-muted-foreground">Performance monitoring coming soon</p>
          <p className="text-xs text-muted-foreground mt-2">
            Agent metrics, response times, and conversion tracking will appear here.
          </p>
        </div>
      </div>
    </>
  );
}
