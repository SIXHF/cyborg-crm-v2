import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { eq } from "drizzle-orm";
import { ProfileClient } from "./profile-client";

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
      sipPassword: users.sipPassword,
      sipAuthUser: users.sipAuthUser,
      sipDisplayName: users.sipDisplayName,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  return (
    <>
      <Topbar title="Profile" user={sessionUser} />
      <ProfileClient
        user={{
          ...fullUser,
          lastLoginAt: fullUser.lastLoginAt?.toISOString() || null,
          createdAt: fullUser.createdAt.toISOString(),
        }}
      />
    </>
  );
}
