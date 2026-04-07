import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { asc } from "drizzle-orm";
import { FieldsClient } from "./fields-client";

export const dynamic = "force-dynamic";

export default async function FieldsPage() {
  const user = await requireAuth(["admin"]);

  const fields = await db
    .select()
    .from(customFields)
    .orderBy(asc(customFields.sortOrder), asc(customFields.fieldKey));

  const fieldsData = fields.map((f) => ({
    id: f.id,
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options as string[] | null,
    isRequired: f.isRequired ?? false,
    isSearchable: f.isSearchable ?? false,
    showInList: f.showInList ?? false,
    isActive: f.isActive ?? true,
    sortOrder: f.sortOrder ?? 0,
  }));

  return (
    <>
      <Topbar title="Custom Fields" user={user} />
      <FieldsClient fields={fieldsData} />
    </>
  );
}
