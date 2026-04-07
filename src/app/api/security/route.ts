import { NextRequest, NextResponse } from "next/server";
import { getUser, audit, forceLogoutAll, forceLogoutUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ipWhitelist, sessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const entries = await db
      .select()
      .from(ipWhitelist)
      .orderBy(ipWhitelist.createdAt);

    return NextResponse.json(entries);
  } catch (error) {
    console.error("List IP whitelist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { ipAddress, label } = await req.json();

    if (!ipAddress) {
      return NextResponse.json({ error: "ipAddress is required" }, { status: 400 });
    }

    const [entry] = await db.insert(ipWhitelist).values({
      ipAddress,
      label: label || null,
    }).returning({ id: ipWhitelist.id });

    await audit(
      user.id, user.username, "add_ip_whitelist", "security", entry.id,
      `Added IP: ${ipAddress}${label ? ` (${label})` : ""}`,
    );

    return NextResponse.json({ success: true, id: entry.id });
  } catch (error) {
    console.error("Add IP whitelist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT — force logout actions
export async function PUT(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { action, userId } = await req.json();

    if (action === "force_logout_all") {
      await forceLogoutAll();
      await audit(user.id, user.username, "force_logout_all", "security", undefined, "Force logged out all users");
      return NextResponse.json({ success: true, message: "All users logged out" });
    }

    if (action === "force_logout_user" && userId) {
      await forceLogoutUser(parseInt(userId));
      await audit(user.id, user.username, "force_logout_user", "security", parseInt(userId), `Force logged out user ${userId}`);
      return NextResponse.json({ success: true, message: "User logged out" });
    }

    // Get active sessions count
    if (action === "get_sessions") {
      const activeSessions = await db.select({
        userId: sessions.userId,
        username: users.username,
        fullName: users.fullName,
        ipAddress: sessions.ipAddress,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      }).from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .orderBy(sessions.createdAt);
      return NextResponse.json(activeSessions);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Security action error:", error);
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
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await db.delete(ipWhitelist).where(eq(ipWhitelist.id, parseInt(id)));

    await audit(
      user.id, user.username, "remove_ip_whitelist", "security", parseInt(id),
      `Removed IP whitelist entry ${id}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove IP whitelist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
