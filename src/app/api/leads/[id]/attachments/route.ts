import { NextRequest, NextResponse } from "next/server";
import { getUser, audit } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadAttachments } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "attachments");

// GET — list attachments for a lead
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rows = await db.select().from(leadAttachments).where(eq(leadAttachments.leadId, parseInt(id))).orderBy(leadAttachments.createdAt);
  return NextResponse.json(rows);
}

// POST — upload a new attachment to a lead
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const ext = path.extname(file.name) || "";
  const storedName = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, storedName), buffer);

  const [attachment] = await db.insert(leadAttachments).values({
    leadId,
    userId: user.id,
    filename: file.name,
    storedName,
    mimeType: file.type || null,
    fileSize: buffer.length,
  }).returning();

  await audit(user.id, user.username, "add_attachment", "lead", leadId, `Uploaded attachment "${file.name}" to lead ${leadId}`);
  return NextResponse.json({ success: true, attachment });
}

// DELETE — remove an attachment
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  const { attachmentId } = await req.json();

  if (!attachmentId) return NextResponse.json({ error: "attachmentId required" }, { status: 400 });

  // Fetch the attachment to get the stored filename before deleting
  const [attachment] = await db.select().from(leadAttachments)
    .where(and(eq(leadAttachments.id, attachmentId), eq(leadAttachments.leadId, leadId)));

  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  // Remove file from disk
  try {
    await unlink(path.join(UPLOAD_DIR, attachment.storedName));
  } catch {
    // File may already be missing — continue with DB cleanup
  }

  await db.delete(leadAttachments).where(and(eq(leadAttachments.id, attachmentId), eq(leadAttachments.leadId, leadId)));
  await audit(user.id, user.username, "delete_attachment", "lead", leadId, `Deleted attachment ${attachmentId} from lead ${leadId}`);
  return NextResponse.json({ success: true });
}
