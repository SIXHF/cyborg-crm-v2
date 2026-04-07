import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { customFields } from "@/lib/db/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const fields = await db
      .select()
      .from(customFields)
      .orderBy(customFields.sortOrder);

    return NextResponse.json(fields);
  } catch (error) {
    console.error("List custom fields error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { fieldKey, label, fieldType, options, isRequired, isSearchable, showInList } = await req.json();

    if (!fieldKey || !label) {
      return NextResponse.json({ error: "fieldKey and label are required" }, { status: 400 });
    }

    const [field] = await db.insert(customFields).values({
      fieldKey,
      label,
      fieldType: fieldType || "text",
      options: options || null,
      isRequired: isRequired ?? false,
      isSearchable: isSearchable ?? false,
      showInList: showInList ?? false,
    }).returning({ id: customFields.id });

    await audit(
      user.id, user.username, "create_custom_field", "custom_field", field.id,
      `Created custom field: ${fieldKey} (${fieldType || "text"})`,
    );

    return NextResponse.json({ success: true, id: field.id });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Field key already exists" }, { status: 409 });
    }
    console.error("Create custom field error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
