import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, rawSql } from "@/lib/db";
import { importJobs } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const maxDuration = 600; // 10 minutes — GIN index recreation can be slow

// POST /api/leads/import/finalize — Recreate indexes after bulk import
export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { jobId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

    // Get saved index definitions from the job
    const [job] = await db.select({ validationRules: importJobs.validationRules })
      .from(importJobs).where(sql`id = ${jobId}`).limit(1);

    const rules = (job?.validationRules || {}) as Record<string, any>;
    const droppedIndexes = rules.droppedIndexes as { name: string; definition: string }[] | undefined;

    if (!droppedIndexes || droppedIndexes.length === 0) {
      return NextResponse.json({ success: true, recreatedIndexes: [], message: "No indexes to recreate" });
    }

    // Check which indexes are actually missing (some might have been recreated already)
    const existingIndexes = await rawSql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'leads' AND schemaname = 'public'
    `;
    const existingNames = new Set(existingIndexes.map((r: any) => r.indexname));

    const recreatedNames: string[] = [];
    const startTime = Date.now();

    for (const idx of droppedIndexes) {
      if (existingNames.has(idx.name)) {
        continue; // Already exists, skip
      }

      try {
        // Add CONCURRENTLY to avoid blocking reads
        // CREATE INDEX CONCURRENTLY cannot run inside a transaction
        const concurrentDef = idx.definition.replace(
          /^CREATE INDEX /i,
          "CREATE INDEX CONCURRENTLY "
        ).replace(
          /^CREATE UNIQUE INDEX /i,
          "CREATE UNIQUE INDEX CONCURRENTLY "
        );
        await rawSql.unsafe(concurrentDef);
        recreatedNames.push(idx.name);
      } catch (e: any) {
        // If CONCURRENTLY fails (e.g., duplicate), try without
        try {
          await rawSql.unsafe(idx.definition);
          recreatedNames.push(idx.name);
        } catch {
          console.error(`Failed to recreate index ${idx.name}:`, e.message);
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      recreatedIndexes: recreatedNames,
      durationMs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
