import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

// GET — keepalive ping (prevents session timeout during active calls)
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, user: user.username, ts: Date.now() });
}
