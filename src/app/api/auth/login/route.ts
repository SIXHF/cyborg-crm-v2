import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ success: false, error: "Username and password required" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const result = await login(username, password, ip);

  if (result.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: result.error }, { status: 401 });
}
