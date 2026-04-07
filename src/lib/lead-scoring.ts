/**
 * Lead scoring algorithm — matches v1 exactly
 * Score range: 0-100
 */
export function calculateLeadScore(lead: {
  creditScoreRange?: string | null;
  annualIncome?: string | number | null;
  employmentStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  dob?: string | null;
  ssnLast4?: string | null;
}): number {
  let score = 0;

  // Credit score (0-35)
  const cs = (lead.creditScoreRange || "").toLowerCase();
  if (cs.includes("800") || cs.includes("exceptional")) score += 35;
  else if (cs.includes("740") || cs.includes("very good")) score += 28;
  else if (cs.includes("670") || cs.includes("good")) score += 20;
  else if (cs.includes("580") || cs.includes("fair")) score += 10;
  else if (cs) score += 5;

  // Annual income (0-25)
  const income = typeof lead.annualIncome === "string" ? parseFloat(lead.annualIncome) : (lead.annualIncome || 0);
  if (income >= 150000) score += 25;
  else if (income >= 80000) score += 20;
  else if (income >= 50000) score += 14;
  else if (income >= 30000) score += 8;
  else if (income > 0) score += 3;

  // Employment (0-20)
  const emp = (lead.employmentStatus || "").toLowerCase();
  if (emp.includes("full")) score += 20;
  else if (emp.includes("self")) score += 15;
  else if (emp.includes("retire")) score += 12;
  else if (emp.includes("part")) score += 10;
  else if (emp) score += 3;

  // Data completeness (0-20)
  const fields = [lead.email, lead.phone, lead.address, lead.city, lead.state, lead.zip, lead.dob, lead.ssnLast4];
  const filled = fields.filter((f) => f && String(f).trim()).length;
  score += Math.round((filled / 8) * 20);

  return Math.min(100, Math.max(0, score));
}

export function scoreColor(score: number): string {
  if (score >= 75) return "text-green-500";
  if (score >= 50) return "text-yellow-500";
  if (score >= 25) return "text-blue-500";
  return "text-red-500";
}

export function scoreBg(score: number): string {
  if (score >= 75) return "bg-green-500/10";
  if (score >= 50) return "bg-yellow-500/10";
  if (score >= 25) return "bg-blue-500/10";
  return "bg-red-500/10";
}
