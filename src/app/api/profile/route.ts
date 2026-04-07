import { NextRequest, NextResponse } from "next/server";
import { getUser, audit, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// PATCH — update own profile (SIP credentials, password)
export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, any> = { updatedAt: new Date() };

  // SIP credential update
  if ("sipUsername" in body) updates.sipUsername = body.sipUsername || null;
  if ("sipPassword" in body) updates.sipPassword = body.sipPassword || null;
  if ("sipAuthUser" in body) updates.sipAuthUser = body.sipAuthUser || null;
  if ("sipDisplayName" in body) updates.sipDisplayName = body.sipDisplayName || null;

  // Password change
  if (body.currentPassword && body.newPassword) {
    // Verify current password
    const [dbUser] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
    if (!dbUser || !await bcrypt.compare(body.currentPassword, dbUser.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }
    updates.passwordHash = await hashPassword(body.newPassword);
    await audit(user.id, user.username, "change_password", "user", user.id, "Password changed");
  }

  await db.update(users).set(updates).where(eq(users.id, user.id));

  if ("sipUsername" in body) {
    await audit(user.id, user.username, "update_sip_credentials", "user", user.id, `SIP: ${body.sipUsername || "cleared"}`);
  }

  return NextResponse.json({ success: true });
}
