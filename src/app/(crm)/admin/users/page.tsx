import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import { cn, timeAgo } from "@/lib/utils";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireAuth(["admin"]);

  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      isActive: users.isActive,
      leadsVisibility: users.leadsVisibility,
      sipUsername: users.sipUsername,
      sipPassword: users.sipPassword,
      allowedIps: users.allowedIps,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  const usersData = allUsers.map((u) => ({
    ...u,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <>
      <Topbar title="Users" user={user} />
      <UsersClient users={usersData} />
    </>
  );
}
