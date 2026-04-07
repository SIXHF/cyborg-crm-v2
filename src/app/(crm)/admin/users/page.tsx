import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireAuth(["admin"]);

  const allUsers = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));

  const roleColors: Record<string, string> = {
    admin: "bg-red-500/10 text-red-500",
    processor: "bg-blue-500/10 text-blue-500",
    agent: "bg-green-500/10 text-green-500",
  };

  return (
    <>
      <Topbar title="Users" user={user} />
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-muted-foreground">{allUsers.length} users</p>
          <Link
            href="/admin/users/new"
            className="h-9 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add User
          </Link>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{u.fullName}</p>
                      <p className="text-xs text-muted-foreground">{u.username} · {u.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium capitalize", roleColors[u.role])}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", u.isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500")}>
                      {u.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {u.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
