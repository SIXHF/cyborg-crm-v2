import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { ssnLookupInfo } from "@/lib/ssn-lookup";

// GET — look up SSN area number to determine issuing state
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admin and processor can see SSN info
  if (user.role === "agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ssn = req.nextUrl.searchParams.get("ssn");
  if (!ssn) {
    return NextResponse.json({ error: "ssn parameter required" }, { status: 400 });
  }

  const result = ssnLookupInfo(ssn);
  return NextResponse.json(result);
}
