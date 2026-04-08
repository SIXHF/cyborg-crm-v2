import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, rawSql } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

// POST /api/leads/import/prepare — Drop indexes before bulk import
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    // Check for concurrent imports
    const running = await rawSql`
      SELECT id FROM import_jobs WHERE status = 'running' AND id != ${jobId} LIMIT 1
    `;
    if (running.length > 0) {
      return NextResponse.json({ error: "Another import is in progress" }, { status: 409 });
    }

    // Capture current index definitions (for recreation later)
    const indexes = await rawSql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'leads'
        AND schemaname = 'public'
        AND indexname NOT IN ('leads_pkey', 'leads_ref_number_unique')
    `;

    if (indexes.length === 0) {
      return NextResponse.json({ success: true, droppedIndexes: [], message: "No indexes to drop" });
    }

    // Store index definitions in the job record for safe recreation
    const [job] = await db.select({ validationRules: importJobs.validationRules })
      .from(importJobs).where(sql`id = ${jobId}`).limit(1);

    const existingRules = (job?.validationRules || {}) as Record<string, any>;
    await db.update(importJobs).set({
      validationRules: {
        ...existingRules,
        droppedIndexes: indexes.map((idx: any) => ({
          name: idx.indexname,
          definition: idx.indexdef,
        })),
      } as any,
    }).where(sql`id = ${jobId}`);

    // Drop all non-essential indexes
    const droppedNames: string[] = [];
    for (const idx of indexes) {
      await rawSql.unsafe(`DROP INDEX IF EXISTS ${idx.indexname}`);
      droppedNames.push(idx.indexname);
    }

    return NextResponse.json({
      success: true,
      droppedIndexes: droppedNames,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
