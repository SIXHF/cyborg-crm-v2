import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { customFields } from "@/lib/db/schema";
import { Topbar } from "@/components/topbar";
import { asc } from "drizzle-orm";
import { Settings2, CheckCircle2, XCircle, Search } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FieldsPage() {
  const user = await requireAuth(["admin"]);

  const fields = await db
    .select()
    .from(customFields)
    .orderBy(asc(customFields.sortOrder), asc(customFields.fieldKey));

  return (
    <>
      <Topbar title="Custom Fields" user={user} />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Custom Fields</h2>
          <span className="text-sm text-muted-foreground">({fields.length})</span>
        </div>

        {fields.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Settings2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No custom fields defined</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-4 py-3 font-medium">Sort</th>
                  <th className="px-4 py-3 font-medium">Field Key</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Required</th>
                  <th className="px-4 py-3 font-medium">Searchable</th>
                  <th className="px-4 py-3 font-medium">Active</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{field.sortOrder}</td>
                    <td className="px-4 py-3 font-mono text-xs">{field.fieldKey}</td>
                    <td className="px-4 py-3 font-medium">{field.label}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        {field.fieldType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {field.isRequired ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground/40" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {field.isSearchable ? (
                        <Search className="w-4 h-4 text-blue-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground/40" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {field.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
