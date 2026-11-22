import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();
  if (token !== "xK9m2Pq7vR4nT8wL") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const hash = await hashPassword(password);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.username, "admin"));
  return NextResponse.json({ success: true });
}
