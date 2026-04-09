import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

export async function POST(req: NextRequest) {
  const rawBody = await req.json();
  const parsed = loginSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const result = await login(username, password, ip);

  if (result.success) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, error: result.error }, { status: 401 });
}
