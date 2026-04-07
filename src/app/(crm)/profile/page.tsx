import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { eq } from "drizzle-orm";
import { User, Mail, Shield, Clock } from "lucide-react";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const sessionUser = await requireAuth();

  const [fullUser] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      lastLoginAt: users.lastLoginAt,
      lastLoginIp: users.lastLoginIp,
      createdAt: users.createdAt,
      sipUsername: users.sipUsername,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  const roleLabel: Record<string, string> = {
    admin: "Administrator",
    processor: "Processor",
    agent: "Agent",
  };

  const roleBadgeColor: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500",
    processor: "bg-blue-500/10 text-blue-500",
    agent: "bg-green-500/10 text-green-500",
  };

  const infoRows = [
    { label: "Full Name", value: fullUser.fullName, icon: User },
    { label: "Email", value: fullUser.email, icon: Mail },
    { label: "Username", value: fullUser.username, icon: User },
    {
      label: "Last Login",
      value: fullUser.lastLoginAt ? timeAgo(new Date(fullUser.lastLoginAt)) : "Never",
      icon: Clock,
    },
    {
      label: "Last Login IP",
      value: fullUser.lastLoginIp ?? "Unknown",
      icon: Shield,
    },
    {
      label: "SIP Username",
      value: fullUser.sipUsername ?? "Not configured",
      icon: Shield,
    },
    {
      label: "Member Since",
      value: new Date(fullUser.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      icon: Clock,
    },
  ];

  return (
    <>
      <Topbar title="Profile" user={sessionUser} />
      <div className="p-6 space-y-6 max-w-2xl">
        {/* Header Card */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">
                {fullUser.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{fullUser.fullName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    roleBadgeColor[fullUser.role] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {roleLabel[fullUser.role] ?? fullUser.role}
                </span>
                <span className="text-sm text-muted-foreground">{fullUser.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {infoRows.map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-6 py-4">
              <row.icon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground w-36 shrink-0">{row.label}</span>
              <span className="text-sm font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
