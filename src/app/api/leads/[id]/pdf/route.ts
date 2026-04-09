import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leads, leadCards, users, leadComments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { jsPDF } from "jspdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const leadId = parseInt(id);
  if (isNaN(leadId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Fetch lead with agent name
  const [lead] = await db.select().from(leads)
    .leftJoin(users, eq(leads.agentId, users.id))
    .where(eq(leads.id, leadId)).limit(1);

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch cards
  const cards = await db.select().from(leadCards).where(eq(leadCards.leadId, leadId));

  // Fetch recent comments
  const comments = await db.select({
    body: leadComments.body,
    createdAt: leadComments.createdAt,
    userName: users.fullName,
  }).from(leadComments)
    .leftJoin(users, eq(leadComments.userId, users.id))
    .where(eq(leadComments.leadId, leadId))
    .orderBy(desc(leadComments.createdAt))
    .limit(10);

  // Build PDF
  const doc = new jsPDF();
  const leadData = lead.leads;
  const agentName = lead.users?.fullName || "Unassigned";

  let y = 20;

  const checkPageBreak = (needed: number) => {
    if (y + needed > 280) {
      doc.addPage();
      y = 20;
    }
  };

  // Title
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.text("Lead Report", 14, y);
  y += 8;

  // Metadata
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 5;
  doc.text(`Ref: ${leadData.refNumber}`, 14, y);
  y += 10;

  // Helper to add a field row
  const addField = (label: string, value: string | null | undefined) => {
    if (value) {
      checkPageBreak(7);
      doc.setTextColor(100);
      doc.text(label + ":", 14, y);
      doc.setTextColor(0);
      doc.text(value, 60, y);
      y += 6;
    }
  };

  // Helper to add a section header
  const addSection = (title: string) => {
    checkPageBreak(14);
    y += 4;
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(title, 14, y);
    y += 7;
    doc.setFontSize(10);
  };

  // ─── Personal Information ───────────────────────────────
  addSection("Personal Information");
  addField("Name", [leadData.firstName, leadData.lastName].filter(Boolean).join(" "));
  addField("Email", leadData.email);
  addField("Phone", leadData.phone);
  addField("Landline", leadData.landline);
  addField("DOB", leadData.dob);
  addField("SSN Last 4", leadData.ssnLast4 ? "****" : null);
  addField("Status", leadData.status);
  addField("Agent", agentName);
  addField("Lead Score", leadData.leadScore != null ? String(leadData.leadScore) : null);

  // ─── Address ────────────────────────────────────────────
  addSection("Address");
  addField("Address", leadData.address);
  addField("City", leadData.city);
  addField("State", leadData.state);
  addField("ZIP", leadData.zip);
  addField("Country", leadData.country);
  addField("County", leadData.county);

  // ─── Financial ──────────────────────────────────────────
  addSection("Financial");
  addField("Annual Income", leadData.annualIncome?.toString());
  addField("Employment", leadData.employmentStatus);
  addField("Credit Score", leadData.creditScoreRange);
  addField("Requested Limit", leadData.requestedLimit?.toString());
  addField("Card Brand", leadData.cardBrand);
  addField("Card Issuer", leadData.cardIssuer);
  addField("Card BIN", leadData.cardNumberBin);

  // ─── Business ───────────────────────────────────────────
  if (leadData.businessName || leadData.businessEin || leadData.mortgageBank) {
    addSection("Business / Mortgage");
    addField("Business Name", leadData.businessName);
    addField("Business EIN", leadData.businessEin);
    addField("Mortgage Bank", leadData.mortgageBank);
    addField("Mortgage Payment", leadData.mortgagePayment?.toString());
  }

  // ─── Cards ──────────────────────────────────────────────
  if (cards.length > 0) {
    addSection(`Cards (${cards.length})`);
    for (const card of cards) {
      addField("Bank", card.bank);
      addField("Type", card.cardType);
      addField("Name on Card", card.noc);
      addField("Number", card.ccn ? `****-****-****-${card.ccn.slice(-4)}` : null);
      addField("Expiry", card.expDate);
      addField("Limit", card.creditLimit?.toString());
      addField("Balance", card.balance?.toString());
      addField("Available", card.available?.toString());
      y += 3;
    }
  }

  // ─── Notes ──────────────────────────────────────────────
  if (leadData.notes) {
    addSection("Notes");
    doc.setTextColor(0);
    const noteLines = doc.splitTextToSize(leadData.notes, 180);
    for (const line of noteLines) {
      checkPageBreak(6);
      doc.text(line, 14, y);
      y += 5;
    }
  }

  if (leadData.processorNotes) {
    addSection("Processor Notes");
    doc.setTextColor(0);
    const noteLines = doc.splitTextToSize(leadData.processorNotes, 180);
    for (const line of noteLines) {
      checkPageBreak(6);
      doc.text(line, 14, y);
      y += 5;
    }
  }

  // ─── Recent Comments ───────────────────────────────────
  if (comments.length > 0) {
    addSection(`Recent Comments (${comments.length})`);
    for (const comment of comments) {
      checkPageBreak(12);
      doc.setTextColor(100);
      doc.text(
        `${comment.userName || "Unknown"} — ${comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ""}`,
        14, y
      );
      y += 5;
      doc.setTextColor(0);
      const lines = doc.splitTextToSize(comment.body || "", 180);
      for (const line of lines) {
        checkPageBreak(6);
        doc.text(line, 14, y);
        y += 5;
      }
      y += 3;
    }
  }

  // Return as PDF
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  const fileName = `lead-${leadData.refNumber || leadId}.pdf`;

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
