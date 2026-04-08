import { requireAuth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <PresenceHeartbeat />
    </div>
  );
}
