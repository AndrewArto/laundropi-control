import { useState, useCallback } from 'react';
import { RevenueEntry, RevenueAuditEntry, RevenueSummary } from '../types';
import { ApiService } from '../services/api';
import { formatMoney } from '../utils/formatting';

type RevenueDraftDeduction = { id: string; amount: string; comment: string };
type RevenueDraft = {
  coinsTotal: string;
  euroCoinsCount: string;
  billsTotal: string;
  deductions: RevenueDraftDeduction[];
};
export type DateEntryInfo = { date: string; hasRevenue: boolean; hasExpenses: boolean; hasStripeRevenue: boolean; hasManualRevenue: boolean };

export interface UseRevenueReturn {
  revenueDate: string;
  revenueEntries: Record<string, RevenueEntry | null>;
  revenueDrafts: Record<string, RevenueDraft>;
  revenueAudit: Record<string, RevenueAuditEntry[]>;
  revenueSummary: { date: string; week: RevenueSummary; month: RevenueSummary } | null;
  revenueLoading: boolean;
  revenueError: string | null;
  revenueSaving: Record<string, boolean>;
  revenueSaveErrors: Record<string, string | null>;
  revenueView: 'daily' | 'all' | 'bankImport' | 'invoicing';
  revenueEntryDates: string[];
  revenueEntryDateInfo: DateEntryInfo[];
  revenueAllEntries: RevenueEntry[];
  revenueAllLoading: boolean;
  revenueAllError: string | null;
  isRevenueCalendarOpen: boolean;
  setRevenueDate: React.Dispatch<React.SetStateAction<string>>;
  setRevenueEntries: React.Dispatch<React.SetStateAction<Record<string, RevenueEntry | null>>>;
  setRevenueDrafts: React.Dispatch<React.SetStateAction<Record<string, RevenueDraft>>>;
  setRevenueAudit: React.Dispatch<React.SetStateAction<Record<string, RevenueAuditEntry[]>>>;
  setRevenueSummary: React.Dispatch<React.SetStateAction<{ date: string; week: RevenueSummary; month: RevenueSummary } | null>>;
  setRevenueLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setRevenueError: React.Dispatch<React.SetStateAction<string | null>>;
  setRevenueSaving: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setRevenueSaveErrors: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  setRevenueView: React.Dispatch<React.SetStateAction<'daily' | 'all' | 'bankImport' | 'invoicing'>>;
  setRevenueEntryDates: React.Dispatch<React.SetStateAction<string[]>>;
  setRevenueEntryDateInfo: React.Dispatch<React.SetStateAction<DateEntryInfo[]>>;
  setRevenueAllEntries: React.Dispatch<React.SetStateAction<RevenueEntry[]>>;
  setRevenueAllLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setRevenueAllError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsRevenueCalendarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  updateRevenueDraft: (agentId: string, updater: (draft: RevenueDraft) => RevenueDraft) => void;
  addRevenueDeduction: (agentId: string) => void;
  removeRevenueDeduction: (agentId: string, id: string) => void;
  handleRevenueSave: (agentId: string) => Promise<void>;
  getLatestAudit: (agentId: string, field: string) => RevenueAuditEntry | null;
  getDeductionSummary: (raw: string | null) => string | null;
  resetRevenueState: () => void;
}

const toDateInput = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeDecimalInput = (val: string): string => {
  return val.replace(',', '.');
};

const makeDeductionId = (): string => {
  return Math.random().toString(36).substring(2);
};

const buildRevenueDraft = (entry: RevenueEntry | null): RevenueDraft => ({
  coinsTotal: entry ? formatMoney(entry.coinsTotal) : '',
  euroCoinsCount: entry ? String(entry.euroCoinsCount) : '',
  billsTotal: entry ? formatMoney(entry.billsTotal) : '',
  deductions: entry?.deductions?.map(d => ({
    id: makeDeductionId(),
    amount: formatMoney(d.amount),
    comment: d.comment,
  })) || [],
});

const parseMoneyInput = (value: string): number | null => {
  if (!value.trim()) return 0;
  const num = Number(normalizeDecimalInput(value.trim()));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
};

const parseCountInput = (value: string): number | null => {
  if (!value.trim()) return 0;
  const num = Number(normalizeDecimalInput(value.trim()));
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
  return num;
};

const normalizeDeductionDrafts = (drafts: RevenueDraftDeduction[]): { error: string | null; list: { amount: number; comment: string }[] } => {
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

export function useRevenue(): UseRevenueReturn {
  const [revenueDate, setRevenueDate] = useState<string>(() => toDateInput(new Date()));
  const [revenueEntries, setRevenueEntries] = useState<Record<string, RevenueEntry | null>>({});
  const [revenueDrafts, setRevenueDrafts] = useState<Record<string, RevenueDraft>>({});
  const [revenueAudit, setRevenueAudit] = useState<Record<string, RevenueAuditEntry[]>>({});
  const [revenueSummary, setRevenueSummary] = useState<{ date: string; week: RevenueSummary; month: RevenueSummary } | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [revenueSaving, setRevenueSaving] = useState<Record<string, boolean>>({});
  const [revenueSaveErrors, setRevenueSaveErrors] = useState<Record<string, string | null>>({});
  const [revenueView, setRevenueView] = useState<'daily' | 'all' | 'bankImport' | 'invoicing'>('daily');
  const [revenueEntryDates, setRevenueEntryDates] = useState<string[]>([]);
  const [revenueEntryDateInfo, setRevenueEntryDateInfo] = useState<DateEntryInfo[]>([]);
  const [revenueAllEntries, setRevenueAllEntries] = useState<RevenueEntry[]>([]);
  const [revenueAllLoading, setRevenueAllLoading] = useState(false);
  const [revenueAllError, setRevenueAllError] = useState<string | null>(null);
  const [isRevenueCalendarOpen, setIsRevenueCalendarOpen] = useState(false);

  const updateRevenueDraft = useCallback((agentId: string, updater: (draft: RevenueDraft) => RevenueDraft) => {
    setRevenueDrafts(prev => {
      const current = prev[agentId] || buildRevenueDraft(revenueEntries[agentId] || null);
      return { ...prev, [agentId]: updater(current) };
    });
    setRevenueSaveErrors(prev => ({ ...prev, [agentId]: null }));
  }, [revenueEntries]);

  const addRevenueDeduction = useCallback((agentId: string) => {
    updateRevenueDraft(agentId, draft => ({
      ...draft,
      deductions: [...draft.deductions, { id: makeDeductionId(), amount: '', comment: '' }],
    }));
  }, [updateRevenueDraft]);

  const removeRevenueDeduction = useCallback((agentId: string, id: string) => {
    updateRevenueDraft(agentId, draft => ({
      ...draft,
      deductions: draft.deductions.filter(d => d.id !== id),
    }));
  }, [updateRevenueDraft]);

  const handleRevenueSave = useCallback(async (agentId: string) => {
    const draft = revenueDrafts[agentId] || buildRevenueDraft(revenueEntries[agentId] || null);
    const coinsTotal = parseMoneyInput(draft.coinsTotal);
    const euroCoinsCount = parseCountInput(draft.euroCoinsCount);
    const billsTotal = parseMoneyInput(draft.billsTotal);

    if (coinsTotal === null) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Coins total must be a non-negative number.' }));
      return;
    }
    if (euroCoinsCount === null) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Coin count must be a non-negative integer.' }));
      return;
    }
    if (billsTotal === null) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Bills total must be a non-negative number.' }));
      return;
    }

    const { list: deductions, error } = normalizeDeductionDrafts(draft.deductions);
    if (error) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: error }));
      return;
    }

    setRevenueSaving(prev => ({ ...prev, [agentId]: true }));
    setRevenueSaveErrors(prev => ({ ...prev, [agentId]: null }));

    try {
      const response = await ApiService.saveRevenueEntry(agentId, {
        entryDate: revenueDate,
        coinsTotal,
        euroCoinsCount,
        billsTotal,
        deductions,
      });

      setRevenueEntries(prev => ({ ...prev, [agentId]: response.entry }));
      setRevenueAudit(prev => ({ ...prev, [agentId]: response.audit || [] }));
      setRevenueDrafts(prev => ({ ...prev, [agentId]: buildRevenueDraft(response.entry) }));

      const summary = await ApiService.getRevenueSummary(revenueDate);
      setRevenueSummary(summary);
    } catch (err: any) {
      console.error('Revenue save failed', err);
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Failed to save revenue entry.' }));
      throw err;
    } finally {
      setRevenueSaving(prev => ({ ...prev, [agentId]: false }));
    }
  }, [revenueDrafts, revenueEntries, revenueDate]);

  const getLatestAudit = useCallback((agentId: string, field: string): RevenueAuditEntry | null => {
    const list = revenueAudit[agentId] || [];
    return list.find(entry => entry.field === field && entry.oldValue !== null) || null;
  }, [revenueAudit]);

  const getDeductionSummary = useCallback((raw: string | null): string | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const sum = parsed.reduce((acc, item) => {
        if (typeof item === 'object' && typeof item.amount === 'number') {
          return acc + item.amount;
        }
        return acc;
      }, 0);
      return formatMoney(sum);
    } catch {
      return null;
    }
  }, []);

  const resetRevenueState = useCallback(() => {
    setRevenueEntries({});
    setRevenueDrafts({});
    setRevenueAudit({});
    setRevenueSummary(null);
    setRevenueLoading(false);
    setRevenueError(null);
    setRevenueSaving({});
    setRevenueSaveErrors({});
    setRevenueView('daily');
    setRevenueEntryDates([]);
    setRevenueEntryDateInfo([]);
    setRevenueAllEntries([]);
    setRevenueAllLoading(false);
    setRevenueAllError(null);
    setIsRevenueCalendarOpen(false);
    setRevenueDate(toDateInput(new Date()));
  }, []);

  return {
    revenueDate,
    revenueEntries,
    revenueDrafts,
    revenueAudit,
    revenueSummary,
    revenueLoading,
    revenueError,
    revenueSaving,
    revenueSaveErrors,
    revenueView,
    revenueEntryDates,
    revenueEntryDateInfo,
    revenueAllEntries,
    revenueAllLoading,
    revenueAllError,
    isRevenueCalendarOpen,
    setRevenueDate,
    setRevenueEntries,
    setRevenueDrafts,
    setRevenueAudit,
    setRevenueSummary,
    setRevenueLoading,
    setRevenueError,
    setRevenueSaving,
    setRevenueSaveErrors,
    setRevenueView,
    setRevenueEntryDates,
    setRevenueEntryDateInfo,
    setRevenueAllEntries,
    setRevenueAllLoading,
    setRevenueAllError,
    setIsRevenueCalendarOpen,
    updateRevenueDraft,
    addRevenueDeduction,
    removeRevenueDeduction,
    handleRevenueSave,
    getLatestAudit,
    getDeductionSummary,
    resetRevenueState,
  };
}
