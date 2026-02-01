import { RevenueEntry, RevenueAuditEntry } from '../types';
import { formatMoney, makeDeductionId, normalizeDecimalInput } from './formatting';

export interface RevenueDraft {
  coinsTotal: string;
  euroCoinsCount: string;
  billsTotal: string;
  deductions: RevenueDraftDeduction[];
}

export interface RevenueDraftDeduction {
  id: string;
  amount: string;
  comment: string;
}

export const buildRevenueDraft = (entry: RevenueEntry | null): RevenueDraft => ({
  coinsTotal: entry ? formatMoney(entry.coinsTotal) : '',
  euroCoinsCount: entry ? String(entry.euroCoinsCount) : '',
  billsTotal: entry ? formatMoney(entry.billsTotal) : '',
  deductions: entry?.deductions?.map(d => ({
    id: makeDeductionId(),
    amount: formatMoney(d.amount),
    comment: d.comment,
  })) || [],
});

export const parseMoneyInput = (value: string) => {
  if (!value.trim()) return 0;
  const num = Number(normalizeDecimalInput(value.trim()));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
};

export const parseCountInput = (value: string) => {
  if (!value.trim()) return 0;
  const num = Number(normalizeDecimalInput(value.trim()));
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
  return num;
};

export const normalizeDeductionDrafts = (drafts: RevenueDraftDeduction[]) => {
  const normalized: { amount: number; comment: string }[] = [];
  for (const item of drafts) {
    const amountText = item.amount.trim();
    const comment = item.comment.trim();
    if (!amountText && !comment) continue;
    if (!comment) return { error: 'Deduction comment is required.', list: [] };
    const amount = parseMoneyInput(amountText);
    if (amount === null) return { error: 'Deduction amount must be a non-negative number.', list: [] };
    normalized.push({ amount, comment });
  }
  return { error: null, list: normalized };
};

export const getLatestAudit = (revenueAudit: Record<string, RevenueAuditEntry[]>, agentId: string, field: string) => {
  const list = revenueAudit[agentId] || [];
  return list.find(entry => entry.field === field && entry.oldValue !== null) || null;
};

export const getDeductionSummary = (raw: string | null) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const sum = parsed.reduce((acc, item) => {
      const amount = Number(item?.amount);
      return Number.isFinite(amount) ? acc + amount : acc;
    }, 0);
    return { count: parsed.length, total: Math.round(sum * 100) / 100 };
  } catch {
    return null;
  }
};

/**
 * Calculate revenue from a RevenueEntry.
 * IMPORTANT: coinsTotal is the main revenue field (includes cash + Stripe).
 * billsTotal is a legacy field and should NOT be added to revenue.
 * This ensures consistency between chart data and summary calculations.
 */
export const getEntryRevenue = (entry: RevenueEntry | { coinsTotal?: number; billsTotal?: number }): number => {
  return entry.coinsTotal || 0;
};

/**
 * Calculate profit/loss from a RevenueEntry.
 * Revenue minus deductions (costs).
 */
export const getEntryProfitLoss = (entry: RevenueEntry): number => {
  const revenue = getEntryRevenue(entry);
  const costs = entry.deductionsTotal || 0;
  return revenue - costs;
};

// --- Sort & Filter for "All entries" table ---

export interface AllEntriesSort {
  col: string;
  dir: 'asc' | 'desc';
}

export type AllEntriesFilters = Record<string, string>;

const NUMERIC_COLS = new Set(['coinsTotal', 'euroCoinsCount', 'billsTotal', 'deductionsTotal', 'updatedAt']);

export const filterRevenueEntries = (entries: RevenueEntry[], filters: AllEntriesFilters): RevenueEntry[] => {
  return entries.filter(entry => {
    if (filters.entryDate && !entry.entryDate.includes(filters.entryDate)) return false;
    if (filters.agentId && entry.agentId !== filters.agentId) return false;
    if (filters.coinsTotal && entry.coinsTotal < Number(filters.coinsTotal)) return false;
    if (filters.euroCoinsCount && entry.euroCoinsCount < Number(filters.euroCoinsCount)) return false;
    if (filters.billsTotal && entry.billsTotal < Number(filters.billsTotal)) return false;
    if (filters.deductionsTotal && entry.deductionsTotal < Number(filters.deductionsTotal)) return false;
    if (filters.updatedBy && !(entry.updatedBy || '').toLowerCase().includes(filters.updatedBy.toLowerCase())) return false;
    return true;
  });
};

export const sortRevenueEntries = (entries: RevenueEntry[], sort: AllEntriesSort): RevenueEntry[] => {
  return [...entries].sort((a, b) => {
    const col = sort.col as keyof typeof a;
    const av = a[col];
    const bv = b[col];
    let cmp: number;
    if (NUMERIC_COLS.has(sort.col)) {
      cmp = (Number(av) || 0) - (Number(bv) || 0);
    } else {
      cmp = String(av ?? '').localeCompare(String(bv ?? ''));
    }
    return sort.dir === 'asc' ? cmp : -cmp;
  });
};
