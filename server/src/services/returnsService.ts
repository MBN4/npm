import { db } from '../db/index.js';

export interface ReturnPolicy {
  windowHours: number;
  policyText: string;
  defaultDeductionPercent: number;
}

const DEFAULT_POLICY: ReturnPolicy = {
  windowHours: 72,
  policyText: 'Returns, refunds and replacements are accepted within 72 hours of purchase with the original bill, at 0% deduction by default. Loose tablets/capsules, opened, dose-dispensed, tampered or customer-damaged products are not returnable.',
  defaultDeductionPercent: 0,
};

/** Generates a sequential return number, mirroring generateInvoiceNumber() in posRoutes.ts */
export function generateReturnNumber(): string {
  const year = new Date().getFullYear();
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM sales_returns WHERE return_number LIKE ?`).get(`RET-${year}-%`) as { cnt: number };
  const nextSeq = String(countRow.cnt + 1).padStart(6, '0');
  return `RET-${year}-${nextSeq}`;
}

export function getReturnPolicy(): ReturnPolicy {
  const rows = db.prepare(`
    SELECT key, value FROM settings
    WHERE key IN ('return_policy_window_hours', 'return_policy_text', 'return_policy_default_deduction_percent')
  `).all() as { key: string; value: string }[];

  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    windowHours: map.return_policy_window_hours ? Number(map.return_policy_window_hours) : DEFAULT_POLICY.windowHours,
    policyText: map.return_policy_text || DEFAULT_POLICY.policyText,
    defaultDeductionPercent: map.return_policy_default_deduction_percent ? Number(map.return_policy_default_deduction_percent) : DEFAULT_POLICY.defaultDeductionPercent,
  };
}

function parseSqliteUtc(ts: string): number {
  // better-sqlite3 CURRENT_TIMESTAMP values are "YYYY-MM-DD HH:MM:SS" in UTC with no timezone suffix.
  const iso = ts.includes('T') ? ts : ts.replace(' ', 'T');
  const withZone = iso.endsWith('Z') ? iso : `${iso}Z`;
  return new Date(withZone).getTime();
}

export interface EligibilityResult {
  eligible: boolean;
  hoursSincePurchase: number;
  windowHours: number;
}

/** Advisory-only eligibility check (does not hard-block server-side in v1 — see plan). */
export function computeEligibility(saleCreatedAt: string, policy: ReturnPolicy): EligibilityResult {
  const createdMs = parseSqliteUtc(saleCreatedAt);
  const hoursSincePurchase = Math.max(0, (Date.now() - createdMs) / (1000 * 60 * 60));
  return {
    eligible: hoursSincePurchase <= policy.windowHours,
    hoursSincePurchase: Math.round(hoursSincePurchase * 10) / 10,
    windowHours: policy.windowHours,
  };
}

/** Remaining returnable quantity for a sale item, counting only completed (non-reversed) returns. */
export function getRemainingReturnable(saleItemId: number): number {
  const item = db.prepare('SELECT quantity FROM sale_items WHERE id = ?').get(saleItemId) as { quantity: number } | undefined;
  if (!item) return 0;

  const row = db.prepare(`
    SELECT COALESCE(SUM(sri.quantity_returned), 0) as returned
    FROM sale_return_items sri
    JOIN sales_returns sr ON sr.id = sri.sales_return_id
    WHERE sri.sale_item_id = ? AND sr.status = 'COMPLETED'
  `).get(saleItemId) as { returned: number };

  return Math.max(0, item.quantity - row.returned);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type DeductionType = 'NONE' | 'PERCENTAGE' | 'FIXED';

export interface ReturnMath {
  deductionAmount: number;
  netReturnAmount: number;
}

/** Pure gross/deduction/net math. Never allows negative refunds or deduction exceeding the return value. */
export function computeReturnMath(grossReturnAmount: number, deductionType: DeductionType, deductionValue: number): ReturnMath {
  let deductionAmount = 0;
  if (deductionType === 'PERCENTAGE') {
    deductionAmount = (grossReturnAmount * (Number(deductionValue) || 0)) / 100;
  } else if (deductionType === 'FIXED') {
    deductionAmount = Number(deductionValue) || 0;
  }

  deductionAmount = Math.max(0, Math.min(deductionAmount, grossReturnAmount));
  const netReturnAmount = Math.max(0, grossReturnAmount - deductionAmount);

  return { deductionAmount: round2(deductionAmount), netReturnAmount: round2(netReturnAmount) };
}
