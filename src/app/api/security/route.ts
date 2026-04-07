import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { ipWhitelist } from "@/lib/db/schema";
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
