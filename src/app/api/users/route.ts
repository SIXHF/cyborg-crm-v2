import { NextRequest, NextResponse } from "next/server";
import { getUser, audit, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
        sipAuthUser: users.sipAuthUser,
        sipDisplayName: users.sipDisplayName,
        allowedIps: users.allowedIps,
        lastLoginAt: users.lastLoginAt,
        lastLoginIp: users.lastLoginIp,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt);

    return NextResponse.json(allUsers);
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { username, email, password, fullName, role, isActive, sipUsername, sipPassword, sipAuthUser, sipDisplayName, leadsVisibility, allowedIps } = await req.json();

    if (!username || !email || !password || !fullName) {
      return NextResponse.json({ error: "username, email, password, and fullName are required" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db.insert(users).values({
      username,
      email,
      passwordHash,
      fullName,
      role: role || "agent",
      isActive: isActive !== undefined ? isActive : true,
      sipUsername: sipUsername || null,
      sipPassword: sipPassword || null,
      sipAuthUser: sipAuthUser || null,
      sipDisplayName: sipDisplayName || null,
      leadsVisibility: leadsVisibility || "own",
      allowedIps: allowedIps || null,
    }).returning({ id: users.id });

    await audit(
      user.id, user.username, "create_user", "user", newUser.id,
      `Created user: ${username} (${role || "agent"})`,
    );

    return NextResponse.json({ success: true, id: newUser.id });
  } catch (error: any) {
    // Handle unique constraint violations
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Username or email already exists" }, { status: 409 });
    }
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, username, email, password, fullName, role, isActive, sipUsername, sipPassword, sipAuthUser, sipDisplayName, leadsVisibility, allowedIps } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (fullName !== undefined) updates.fullName = fullName;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (sipUsername !== undefined) updates.sipUsername = sipUsername || null;
    if (sipPassword !== undefined) updates.sipPassword = sipPassword || null;
    if (sipAuthUser !== undefined) updates.sipAuthUser = sipAuthUser || null;
    if (sipDisplayName !== undefined) updates.sipDisplayName = sipDisplayName || null;
    if (leadsVisibility !== undefined) updates.leadsVisibility = leadsVisibility;
    if (allowedIps !== undefined) updates.allowedIps = allowedIps || null;

    if (password) {
      updates.passwordHash = await hashPassword(password);
    }

    updates.updatedAt = new Date();

    await db.update(users).set(updates).where(eq(users.id, id));

    await audit(
      user.id, user.username, "update_user", "user", id,
      `Updated user: ${username || id} (fields: ${Object.keys(updates).filter(k => k !== 'updatedAt' && k !== 'passwordHash').join(', ')}${password ? ', password' : ''})`,
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Username or email already exists" }, { status: 409 });
    }
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    // Prevent self-deletion
    if (id === user.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    // Deactivate instead of hard delete to preserve data integrity
    await db.update(users).set({
      isActive: false,
      updatedAt: new Date(),
    }).where(eq(users.id, id));

    await audit(
      user.id, user.username, "delete_user", "user", id,
      `Deactivated user ID: ${id}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
