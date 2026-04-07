import { requireAuth } from "@/lib/auth";
import { Topbar } from "@/components/topbar";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await requireAuth(["admin"]);

  return (
    <>
      <Topbar title="Bulk Import" user={user} />
      <ImportClient />
    </>
  );
}
