import { NextRequest, NextResponse } from "next/server";
import { getUser, audit, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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

    const { username, email, password, fullName, role } = await req.json();

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
