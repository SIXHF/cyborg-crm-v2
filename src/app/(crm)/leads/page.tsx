import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, users } from "@/lib/db/schema";
import { sql, eq, and, gte, lte, ilike, or, desc, asc, gt, lt } from "drizzle-orm";
import { Topbar } from "@/components/topbar";
import Link from "next/link";
import { LeadListClient } from "./lead-list-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    q?: string;
    name?: string;
    phone?: string;
    bin?: string;
    bank?: string;
    email?: string;
    status?: string;
    agent?: string;
    from?: string;
    to?: string;
    cursor?: string;
    dir?: string;
    limit?: string;
    import_ref?: string;
  }>;
}

export default async function LeadsPage({ searchParams }: Props) {
  const user = await requireAuth();
  const params = await searchParams;

  const limit = Math.min(parseInt(params.limit || "50"), 100);
  const cursor = params.cursor ? parseInt(params.cursor) : null;
  const direction = params.dir === "prev" ? "prev" : "next";

  // Build WHERE conditions
  const conditions: any[] = [];

  // Lead visibility (matches v1):
  // - admin: always sees all leads
  // - processor: sees all leads (unless leadsVisibility is set)
  // - agent with visibility "own": sees only leads they created (agent_id = user.id)
  // - agent with visibility "assigned": sees leads assigned to them (assigned_to = user.id) OR created by them
  // - anyone with visibility "all": sees all leads
  if (user.role !== "admin") {
    const vis = user.leadsVisibility || (user.role === "agent" ? "own" : "all");
    if (vis === "own") {
      conditions.push(eq(leads.agentId, user.id));
    } else if (vis === "assigned") {
      conditions.push(
        or(eq(leads.agentId, user.id), eq(leads.assignedTo, user.id))!
      );
    }
    // vis === "all" — no filter needed
  }

  // Dedicated search fields — each queries only its indexed column
  // Revert name search to simple prefix (faster)
  if (params.name && params.name.trim().length >= 2) {
    const prefix = `${params.name.trim()}%`;
    conditions.push(or(ilike(leads.firstName, prefix), ilike(leads.lastName, prefix)));
  }
  if (params.phone && params.phone.trim().length >= 3) {
    const digits = params.phone.trim().replace(/\D/g, "");
    if (digits.length >= 3) conditions.push(ilike(leads.phone, `%${digits}%`));
  }
  if (params.bin && params.bin.trim().length >= 4) {
    // BIN prefix match — CAN use B-tree index (no leading wildcard)
    conditions.push(sql`${leads.cardNumberBin} LIKE ${params.bin.trim() + "%"}`);
  }
  if (params.bank && params.bank.trim().length >= 2) {
    const term = `%${params.bank.trim()}%`;
    conditions.push(or(ilike(leads.cardIssuer, term), ilike(leads.cardBrand, term)));
  }
  if (params.email && params.email.trim().length >= 3) {
    conditions.push(ilike(leads.email, `%${params.email.trim()}%`));
  }
  // Legacy "search all" fallback
  if (params.q && params.q.trim().length >= 2) {
    const term = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(leads.firstName, term),
        ilike(leads.lastName, term),
        ilike(leads.email, term),
        ilike(leads.phone, term),
        ilike(leads.refNumber, term),
        ilike(leads.cardIssuer, term),
        ilike(leads.cardNumberBin, term),
        ilike(leads.cardBrand, term),
      )
    );
  }

  // Filters
  if (params.status) {
    conditions.push(eq(leads.status, params.status as any));
  }
  if (params.agent) {
    conditions.push(eq(leads.agentId, parseInt(params.agent)));
  }
  if (params.from) {
    conditions.push(gte(leads.createdAt, new Date(params.from)));
  }
  if (params.to) {
    const toDate = new Date(params.to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(leads.createdAt, toDate));
  }
  if (params.import_ref) {
    conditions.push(eq(leads.importRef, params.import_ref));
  }

  // Cursor-based pagination (O(1) instead of OFFSET which is O(n))
  if (cursor) {
    if (direction === "next") {
      conditions.push(lt(leads.id, cursor));
    } else {
      conditions.push(gt(leads.id, cursor));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch leads
  const rows = await db
    .select({
      id: leads.id,
      refNumber: leads.refNumber,
      firstName: leads.firstName,
      lastName: leads.lastName,
      email: leads.email,
      phone: leads.phone,
      status: leads.status,
      state: leads.state,
      cardNumberBin: leads.cardNumberBin,
      cardBrand: leads.cardBrand,
      cardIssuer: leads.cardIssuer,
      agentId: leads.agentId,
      agentName: users.fullName,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(users, eq(leads.agentId, users.id))
    .where(where)
    .orderBy(direction === "prev" ? asc(leads.id) : desc(leads.id))
    .limit(limit + 1); // Fetch one extra to detect if there's a next page

  // Determine pagination
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();
  if (direction === "prev") rows.reverse();

  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].id : null;
  const prevCursor = cursor && rows.length > 0 ? rows[0].id : null;

  // Total count — use exact count for unfiltered views, estimate for searches
  const hasSearchFilters = !!(params.name || params.phone || params.bin || params.bank || params.email || params.q);
  const countConditions = conditions.filter((_, i) => !(cursor && i >= conditions.length - 1));
  let countResult: { count: number };

  if (hasSearchFilters && countConditions.length > 0) {
    // For search: use limited count (cap at 10000) to avoid slow full scans
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(
      db.select({ id: leads.id }).from(leads).where(and(...countConditions)).limit(10000).as("limited")
    );
    countResult = result;
  } else {
    // For unfiltered: use exact count (fast with no WHERE, or simple indexed filters)
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(leads).where(
      countConditions.length > 0 ? and(...countConditions) : undefined
    );
    countResult = result;
  }

  // Get agents for filter dropdown
  const agents = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.isActive, true)));

  return (
    <>
      <Topbar title="Leads" user={user} />
      <LeadListClient
        leads={rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        }))}
        total={countResult.count}
        nextCursor={nextCursor}
        prevCursor={prevCursor}
        agents={agents}
        filters={params}
        userRole={user.role}
      />
    </>
  );
}
