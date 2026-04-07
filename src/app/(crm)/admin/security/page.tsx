import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ipWhitelist } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { desc } from "drizzle-orm";
import { SecurityClient } from "./security-client";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireAuth(["admin"]);

  const whitelist = await db
    .select()
    .from(ipWhitelist)
    .orderBy(desc(ipWhitelist.createdAt));

  const whitelistData = whitelist.map((entry) => ({
    id: entry.id,
    ipAddress: entry.ipAddress,
    label: entry.label,
    createdAt: new Date(entry.createdAt).toISOString(),
  }));

  return (
    <>
      <Topbar title="Security" user={user} />
      <SecurityClient whitelist={whitelistData} />
    </>
  );
}
