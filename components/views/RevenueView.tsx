import React, { useState } from 'react';
import { Coins, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, Download, CalendarClock, Upload, Building2 } from 'lucide-react';
import { RevenueEntry, RevenueAuditEntry, RevenueSummary, UiUser, ExpenditureImport, ExpenditureTransaction, GENERAL_AGENT_ID, GENERAL_LAUNDRY } from '../../types';
import type { DateEntryInfo } from '../../hooks/useRevenue';
import { BankImportView } from './BankImportView';
import type { ReconciliationSummary, PendingChange } from '../../hooks/useReconciliation';

// Map field names to user-friendly labels
const fieldLabels: Record<string, string> = {
  coinsTotal: 'Revenue total',
  euroCoinsCount: 'Coins in €1',
  billsTotal: 'Bills total',
  deductions: 'Deductions',
  deductionsTotal: 'Deductions total',
};

const getFieldLabel = (field: string) => fieldLabels[field] || field;

// Simple donut chart component for revenue/costs visualization
interface DonutChartProps {
  revenue: number;
  costs: number;
  size?: number;
  label: string;
  profitLoss: number;
  formatMoney: (val: number) => string;
  large?: boolean;
}

const DonutChart: React.FC<DonutChartProps> = ({ revenue, costs, size = 60, label, profitLoss, formatMoney, large = false }) => {
  // Show costs as a portion of revenue (red = cost%, green = profit%)
  // If costs exceed revenue, cap red at 100%
  const costsPercent = revenue > 0 ? Math.min((costs / revenue) * 100, 100) : (costs > 0 ? 100 : 0);
  const profitPercent = 100 - costsPercent;
  const strokeWidth = large ? 8 : 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const profitStroke = (profitPercent / 100) * circumference;
  const costsStroke = (costsPercent / 100) * circumference;

  return (
    <div className={`flex items-center ${large ? 'gap-4' : 'gap-2'}`}>
      <svg width={size} height={size} className="transform -rotate-90 flex-shrink-0">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700"
        />
        {/* Profit arc (green) - starts at top */}
        {profitPercent > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${profitStroke} ${costsStroke}`}
            strokeDashoffset={0}
            className="text-emerald-500"
            strokeLinecap="round"
          />
        )}
        {/* Costs arc (red) - starts where profit ends */}
        {costsPercent > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${costsStroke} ${profitStroke}`}
            strokeDashoffset={-profitStroke}
            className="text-red-400"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="text-left min-w-0">
        <div className={`${large ? 'text-xs' : 'text-[10px]'} text-slate-500 uppercase`}>{label}</div>
        <div className={`${large ? 'text-2xl font-semibold' : 'text-xs'} text-white`}>€{formatMoney(revenue)}</div>
        <div className={`${large ? 'text-base' : 'text-[10px]'} text-red-400`}>−€{formatMoney(costs)}</div>
        <div className={`${large ? 'text-lg' : 'text-xs'} font-semibold ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          P/L €{formatMoney(profitLoss)}
        </div>
      </div>
    </div>
  );
};

interface Laundry {
  id: string;
  name: string;
  relays: any[];
  isOnline: boolean;
  isMock: boolean;
  lastHeartbeat: number | null;
}

type RevenueDraftDeduction = { id: string; amount: string; comment: string };
type RevenueDraft = {
  coinsTotal: string;
  euroCoinsCount: string;
  billsTotal: string;
  deductions: RevenueDraftDeduction[];
};

interface RevenueViewProps {
  authUser: UiUser | null;
  laundries: Laundry[];
  revenueView: 'daily' | 'all' | 'bankImport';
  setRevenueView: React.Dispatch<React.SetStateAction<'daily' | 'all' | 'bankImport'>>;
  revenueDate: string;
  setRevenueDate: React.Dispatch<React.SetStateAction<string>>;
  isRevenueCalendarOpen: boolean;
  setIsRevenueCalendarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  revenueEntryDates: string[];
  revenueEntryDateInfo: DateEntryInfo[];
  revenueEntries: Record<string, RevenueEntry | null>;
  revenueLoading: boolean;
  revenueError: string | null;
  revenueSummary: { date: string; week: RevenueSummary; month: RevenueSummary } | null;
  revenueSaveErrors: Record<string, string | null>;
  revenueSaving: Record<string, boolean>;
  revenueDrafts: Record<string, RevenueDraft>;
  revenueAudit: Record<string, RevenueAuditEntry[]>;
  revenueAllEntries: RevenueEntry[];
  revenueAllLoading: boolean;
  revenueAllError: string | null;
  DAYS_OF_WEEK: readonly string[];
  getMonthRange: (dateStr: string) => { year: number; month: number; daysInMonth: number } | null;
  shiftDateByDays: (dateStr: string, days: number) => string;
  shiftDateByMonths: (dateStr: string, months: number) => string;
  formatMoney: (value: number) => string;
  formatTimestamp: (ts: string | number) => string;
  buildRevenueDraft: (entry: RevenueEntry | null) => RevenueDraft;
  updateRevenueDraftFromHook: (agentId: string, updater: (draft: RevenueDraft) => RevenueDraft) => void;
  isRevenueNumericInput: (value: string) => boolean;
  getLatestAudit: (agentId: string, field: string) => RevenueAuditEntry | undefined;
  getDeductionSummary: (value: any) => { total: number; count: number } | null;
  addRevenueDeductionFromHook: (agentId: string) => void;
  removeRevenueDeductionFromHook: (agentId: string, deductionId: string) => void;
  handleRevenueSaveFromHook: (agentId: string) => Promise<void>;
  handleExportRevenueCsv: () => void;
  // Bank Import props
  bankImports: ExpenditureImport[];
  bankActiveImport: ExpenditureImport | null;
  bankTransactions: ExpenditureTransaction[];
  bankSummary: ReconciliationSummary | null;
  bankLoading: boolean;
  bankUploading: boolean;
  bankApplying: boolean;
  bankError: string | null;
  bankPendingChanges: Map<string, PendingChange>;
  bankHasUnsavedChanges: boolean;
  onBankUploadCsv: (file: File) => Promise<{ success: boolean; error?: string; warnings?: string[] }>;
  onBankLoadImport: (importId: string) => Promise<void>;
  onBankAssignTransaction: (transactionId: string, agentId: string, entryDate?: string, comment?: string) => void;
  onBankAssignStripeCredit: (transactionId: string, agentId: string, entryDate?: string) => void;
  onBankIgnoreTransaction: (transactionId: string, notes?: string) => void;
  onBankUnignoreTransaction: (transactionId: string) => void;
  onBankUndoChange: (transactionId: string) => void;
  onBankApplyChanges: () => Promise<boolean | void>;
  onBankCompleteImport: (notes?: string) => Promise<any>;
  onBankCancelImport: (notes?: string) => Promise<any>;
  onBankDeleteImport: (importId: string) => Promise<void>;
  onBankClearActiveImport: () => void;
}

export const RevenueView: React.FC<RevenueViewProps> = (props) => {
  // Track which agent sections are expanded (default all collapsed)
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const toggleAgentExpanded = (agentId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const {
    authUser,
    laundries,
    revenueView,
    setRevenueView,
    revenueDate,
    setRevenueDate,
    isRevenueCalendarOpen,
    setIsRevenueCalendarOpen,
    revenueEntryDates,
    revenueEntryDateInfo,
    revenueEntries,
    revenueLoading,
    revenueError,
    revenueSummary,
    revenueSaveErrors,
    revenueSaving,
    revenueDrafts,
    revenueAudit,
    revenueAllEntries,
    revenueAllLoading,
    revenueAllError,
    DAYS_OF_WEEK,
    getMonthRange,
    shiftDateByDays,
    shiftDateByMonths,
    formatMoney,
    formatTimestamp,
    buildRevenueDraft,
    updateRevenueDraftFromHook,
    isRevenueNumericInput,
    getLatestAudit,
    getDeductionSummary,
    addRevenueDeductionFromHook,
    removeRevenueDeductionFromHook,
    handleRevenueSaveFromHook,
    handleExportRevenueCsv,
    // Bank Import props
    bankImports,
    bankActiveImport,
    bankTransactions,
    bankSummary,
    bankLoading,
    bankUploading,
    bankApplying,
    bankError,
    bankPendingChanges,
    bankHasUnsavedChanges,
    onBankUploadCsv,
    onBankLoadImport,
    onBankAssignTransaction,
    onBankAssignStripeCredit,
    onBankIgnoreTransaction,
    onBankUnignoreTransaction,
    onBankUndoChange,
    onBankApplyChanges,
    onBankCompleteImport,
    onBankCancelImport,
    onBankDeleteImport,
    onBankClearActiveImport,
  } = props;

  const renderRevenueCalendar = () => {
    const range = getMonthRange(revenueDate);
    if (!range) return null;
    const { year, month, daysInMonth } = range;
    const firstDay = new Date(year, month - 1, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const entryDates = new Set(revenueEntryDates);
    // Build a map of date -> info for quick lookup
    const dateInfoMap = new Map(revenueEntryDateInfo.map(info => [info.date, info]));
    const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
      <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRevenueDate(shiftDateByMonths(revenueDate, -1))}
            className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
            aria-label="Previous month"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <div className="text-sm font-semibold text-slate-200">{monthLabel}</div>
          <button
            type="button"
            onClick={() => setRevenueDate(shiftDateByMonths(revenueDate, 1))}
            className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
            aria-label="Next month"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase text-slate-500">
          {DAYS_OF_WEEK.map(day => (
            <div key={`weekday-${day}`} className="text-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: totalCells }, (_, idx) => {
            const day = idx - startOffset + 1;
            if (day < 1 || day > daysInMonth) {
              return <div key={`empty-${idx}`} className="h-9" />;
            }
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateStr === revenueDate;
            const hasEntry = entryDates.has(dateStr);
            const dateInfo = dateInfoMap.get(dateStr);
            const hasRevenue = dateInfo?.hasRevenue ?? false;
            const hasExpenses = dateInfo?.hasExpenses ?? false;
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setRevenueDate(dateStr)}
                className={`h-9 rounded-md text-xs flex flex-col items-center justify-center border ${
                  isSelected
                    ? 'border-indigo-400/80 bg-indigo-500/20 text-white'
                    : 'border-transparent text-slate-200 hover:bg-slate-800/60'
                }`}
                aria-label={`Select ${dateStr}`}
              >
                <span>{day}</span>
                {(hasRevenue || hasExpenses) && (
                  <div className="mt-0.5 flex gap-0.5">
                    {hasRevenue && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                    {hasExpenses && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Revenue
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Expenses
          </div>
        </div>
      </div>
    );
  };

  const renderRevenueDaily = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs text-slate-400">Entry date</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setRevenueDate(shiftDateByDays(revenueDate, -1))}
              className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={revenueDate}
              onChange={(e) => setRevenueDate(e.target.value)}
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-auto"
            />
            <button
              type="button"
              onClick={() => setRevenueDate(shiftDateByDays(revenueDate, 1))}
              className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsRevenueCalendarOpen(prev => !prev)}
          className="flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white sm:justify-start"
          aria-expanded={isRevenueCalendarOpen}
        >
          <span className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            Calendar
          </span>
          {isRevenueCalendarOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isRevenueCalendarOpen && renderRevenueCalendar()}

      {revenueError && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-3 py-2 rounded-lg text-sm">
          {revenueError}
        </div>
      )}

      {revenueSummary && (() => {
        const weekCosts = revenueSummary.week.overall - revenueSummary.week.profitLossOverall;
        const monthCosts = revenueSummary.month.overall - revenueSummary.month.profitLossOverall;
        return (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <DonutChart
                revenue={revenueSummary.week.overall}
                costs={weekCosts}
                size={80}
                label="Week (Mon–Sun)"
                profitLoss={revenueSummary.week.profitLossOverall}
                formatMoney={formatMoney}
                large
              />
              <div className="text-xs text-slate-500 mt-2">{revenueSummary.week.startDate} → {revenueSummary.week.endDate}</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <DonutChart
                revenue={revenueSummary.month.overall}
                costs={monthCosts}
                size={80}
                label="Month"
                profitLoss={revenueSummary.month.profitLossOverall}
                formatMoney={formatMoney}
                large
              />
              <div className="text-xs text-slate-500 mt-2">{revenueSummary.month.startDate} → {revenueSummary.month.endDate}</div>
            </div>
          </div>
        );
      })()}

      {revenueLoading && (
        <div className="text-sm text-slate-400">Loading revenue data...</div>
      )}

      {!revenueLoading && [...(laundries || []), GENERAL_LAUNDRY].map(laundry => {
        const isGeneral = laundry.id === GENERAL_AGENT_ID;
        const entry = revenueEntries[laundry.id] || null;
        const draft = revenueDrafts[laundry.id] || buildRevenueDraft(entry) || { coinsTotal: '', euroCoinsCount: '', billsTotal: '', deductions: [] };
        const entryAudit = revenueAudit[laundry.id] || [];
        const coinsAudit = getLatestAudit(laundry.id, 'coinsTotal');
        const countAudit = getLatestAudit(laundry.id, 'euroCoinsCount');
        const billsAudit = getLatestAudit(laundry.id, 'billsTotal');
        const deductionsAudit = getLatestAudit(laundry.id, 'deductions');
        const prevDeductionSummary = getDeductionSummary(deductionsAudit?.oldValue ?? null);
        const weekTotal = revenueSummary?.week.totalsByAgent?.[laundry.id] ?? 0;
        const monthTotal = revenueSummary?.month.totalsByAgent?.[laundry.id] ?? 0;
        const weekProfitLoss = revenueSummary?.week.profitLossByAgent?.[laundry.id] ?? 0;
        const monthProfitLoss = revenueSummary?.month.profitLossByAgent?.[laundry.id] ?? 0;
        const weekDeductions = entry?.deductionsTotal ?? 0;
        const saveError = revenueSaveErrors[laundry.id];
        const saving = Boolean(revenueSaving[laundry.id]);

        const fieldClass = (changed: boolean) => (
          `w-full bg-slate-900/60 border rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
            changed ? 'border-amber-400/70 bg-amber-500/10' : 'border-slate-700'
          }`
        );

        // Fix cost center - only shows deductions, collapsible
        if (isGeneral) {
          const isExpanded = expandedAgents.has(laundry.id);
          const totalCosts = entry?.deductionsTotal ?? 0;
          // Fix costs totals: profitLoss is negative (deductions only, no revenue)
          const weekFixCosts = Math.abs(weekProfitLoss);
          const monthFixCosts = Math.abs(monthProfitLoss);

          return (
            <div key={laundry.id} className="bg-slate-800 border border-purple-500/30 rounded-xl overflow-hidden">
              {/* Collapsible header */}
              <button
                onClick={() => toggleAgentExpanded(laundry.id)}
                className="w-full p-4 flex items-center justify-between gap-4 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-purple-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-purple-400" />
                  )}
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-400" />
                    <div className="text-left">
                      <div className="text-sm font-semibold text-white">{laundry.name}</div>
                      <div className="text-xs text-slate-500">
                        {isExpanded ? 'Fixed costs (deducted from total P&L)' : 'Click to expand'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {(weekFixCosts > 0 || monthFixCosts > 0) && (
                    <div className="flex items-center gap-2 text-xs text-purple-300">
                      <span>Week: €{formatMoney(weekFixCosts)}</span>
                      <span className="text-slate-600">|</span>
                      <span>Month: €{formatMoney(monthFixCosts)}</span>
                    </div>
                  )}
                  {totalCosts > 0 && (
                    <span className="text-sm font-semibold text-red-400">
                      Today: €{formatMoney(totalCosts)}
                    </span>
                  )}
                  {entry?.hasEdits && (
                    <span className="text-xs px-2 py-1 rounded-full border border-amber-400 text-amber-200 bg-amber-500/10">
                      Edited
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full border border-purple-500/50 text-purple-300 bg-purple-500/10">
                    Costs only
                  </span>
                </div>
              </button>

              {/* Collapsible content */}
              {isExpanded && (
                <div className="p-4 pt-0 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-300">Costs (comment required)</div>
                      <button
                        onClick={() => addRevenueDeductionFromHook(laundry.id)}
                        className="text-xs px-2 py-1 rounded-md border border-purple-500/50 text-purple-300 hover:border-purple-400 hover:text-purple-200 transition-colors"
                      >
                        Add cost
                      </button>
                    </div>
                    {deductionsAudit && prevDeductionSummary && (
                      <div className="text-[11px] text-amber-300">
                        Prev: €{formatMoney(prevDeductionSummary.total)} across {prevDeductionSummary.count} items · {deductionsAudit.user} · {formatTimestamp(deductionsAudit.createdAt)}
                      </div>
                    )}
                    {draft.deductions.length === 0 && (
                      <div className="text-xs text-slate-500">No costs added yet.</div>
                    )}
                    {draft.deductions.map(item => (
                      <div key={item.id} className="flex flex-wrap gap-2 items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.amount}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            if (!isRevenueNumericInput(nextValue)) return;
                            updateRevenueDraftFromHook(laundry.id, d => ({
                              ...d,
                              deductions: d.deductions.map(row => row.id === item.id ? { ...row, amount: nextValue } : row),
                            }));
                          }}
                          className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[120px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          placeholder="0.00"
                        />
                        <input
                          type="text"
                          value={item.comment}
                          onChange={(e) => updateRevenueDraftFromHook(laundry.id, d => ({
                            ...d,
                            deductions: d.deductions.map(row => row.id === item.id ? { ...row, comment: e.target.value } : row),
                          }))}
                          className="flex-[2] min-w-0 w-full sm:w-auto sm:min-w-[200px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          placeholder="Reason"
                        />
                        <button
                          onClick={() => removeRevenueDeductionFromHook(laundry.id, item.id)}
                          className="text-xs px-3 py-2 w-full sm:w-auto rounded-md border border-red-500/40 text-red-300 hover:text-red-200 hover:border-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {saveError && (
                    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                      {saveError}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      {entry
                        ? `Updated ${formatTimestamp(entry.updatedAt)} by ${entry.updatedBy || 'unknown'}`
                        : 'No entry recorded for this date.'}
                    </div>
                    <button
                      onClick={() => handleRevenueSaveFromHook(laundry.id)}
                      disabled={saving}
                      className="px-4 py-2 rounded-md text-xs font-semibold border border-purple-500 text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save costs'}
                    </button>
                  </div>

                  {entryAudit.length > 0 && (
                    <div className="text-xs text-slate-500 border-t border-slate-700 pt-3 space-y-1">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Audit log</div>
                      {entryAudit.filter(item => item.oldValue !== null).slice(0, 6).map(item => (
                        <div key={`${item.id}-${item.createdAt}`} className="flex flex-wrap justify-between gap-2">
                          <span>{getFieldLabel(item.field)}: {item.oldValue} → {item.newValue}</span>
                          <span>{item.user} · {formatTimestamp(item.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        }

        // Regular laundry box - collapsible
        const isExpanded = expandedAgents.has(laundry.id);
        const weekCosts = (revenueSummary?.week.totalsByAgent?.[laundry.id] ?? 0) - (revenueSummary?.week.profitLossByAgent?.[laundry.id] ?? 0);
        const monthCosts = (revenueSummary?.month.totalsByAgent?.[laundry.id] ?? 0) - (revenueSummary?.month.profitLossByAgent?.[laundry.id] ?? 0);

        return (
          <div key={laundry.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {/* Collapsible header */}
            <button
              onClick={() => toggleAgentExpanded(laundry.id)}
              className="w-full p-4 flex items-center justify-between gap-4 hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
                <div className="text-left">
                  <div className="text-sm font-semibold text-white">{laundry.name}</div>
                  {!isExpanded && (
                    <div className="text-xs text-slate-500">Click to expand</div>
                  )}
                </div>
              </div>

              {/* Pie charts - always visible, centered with fixed width */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-4">
                  <div className="w-[140px]">
                    <DonutChart
                      revenue={weekTotal}
                      costs={weekCosts}
                      size={50}
                      label="Week"
                      profitLoss={weekProfitLoss}
                      formatMoney={formatMoney}
                    />
                  </div>
                  <div className="w-[140px]">
                    <DonutChart
                      revenue={monthTotal}
                      costs={monthCosts}
                      size={50}
                      label="Month"
                      profitLoss={monthProfitLoss}
                      formatMoney={formatMoney}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 w-[180px] justify-end">
                  {entry?.hasEdits && (
                    <span className="text-xs px-2 py-1 rounded-full border border-amber-400 text-amber-200 bg-amber-500/10">
                      Edited
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full border border-slate-600 text-slate-300 bg-slate-900/40">
                    {entry ? 'Entry loaded' : 'No entry yet'}
                  </span>
                </div>
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="p-4 pt-0 space-y-4 border-t border-slate-700">
                <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Revenue total (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.coinsTotal}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraftFromHook(laundry.id, d => ({ ...d, coinsTotal: nextValue }));
                  }}
                  className={fieldClass(Boolean(coinsAudit))}
                  placeholder="0.00"
                />
                {coinsAudit && (
                  <div className="text-[11px] text-amber-300">
                    Prev: €{formatMoney(Number(coinsAudit.oldValue))} · {coinsAudit.user} · {formatTimestamp(coinsAudit.createdAt)}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Coins in €1 (count)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.euroCoinsCount}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraftFromHook(laundry.id, d => ({ ...d, euroCoinsCount: nextValue }));
                  }}
                  className={fieldClass(Boolean(countAudit))}
                  placeholder="0"
                />
                {countAudit && (
                  <div className="text-[11px] text-amber-300">
                    Prev: {countAudit.oldValue} · {countAudit.user} · {formatTimestamp(countAudit.createdAt)}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Bills total (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.billsTotal}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraftFromHook(laundry.id, d => ({ ...d, billsTotal: nextValue }));
                  }}
                  className={fieldClass(Boolean(billsAudit))}
                  placeholder="0.00"
                />
                {billsAudit && (
                  <div className="text-[11px] text-amber-300">
                    Prev: €{formatMoney(Number(billsAudit.oldValue))} · {billsAudit.user} · {formatTimestamp(billsAudit.createdAt)}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">Deductions (comment required)</div>
                <button
                  onClick={() => addRevenueDeductionFromHook(laundry.id)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                >
                  Add deduction
                </button>
              </div>
              {deductionsAudit && prevDeductionSummary && (
                <div className="text-[11px] text-amber-300">
                  Prev: €{formatMoney(prevDeductionSummary.total)} across {prevDeductionSummary.count} items · {deductionsAudit.user} · {formatTimestamp(deductionsAudit.createdAt)}
                </div>
              )}
              {draft.deductions.length === 0 && (
                <div className="text-xs text-slate-500">No deductions yet.</div>
              )}
              {draft.deductions.map(item => (
                <div key={item.id} className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      if (!isRevenueNumericInput(nextValue)) return;
                      updateRevenueDraftFromHook(laundry.id, d => ({
                        ...d,
                        deductions: d.deductions.map(row => row.id === item.id ? { ...row, amount: nextValue } : row),
                      }));
                    }}
                    className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[120px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                  <input
                    type="text"
                    value={item.comment}
                    onChange={(e) => updateRevenueDraftFromHook(laundry.id, d => ({
                      ...d,
                      deductions: d.deductions.map(row => row.id === item.id ? { ...row, comment: e.target.value } : row),
                    }))}
                    className="flex-[2] min-w-0 w-full sm:w-auto sm:min-w-[200px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Reason"
                  />
                  <button
                    onClick={() => removeRevenueDeductionFromHook(laundry.id, item.id)}
                    className="text-xs px-3 py-2 w-full sm:w-auto rounded-md border border-red-500/40 text-red-300 hover:text-red-200 hover:border-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {saveError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {entry
                  ? `Updated ${formatTimestamp(entry.updatedAt)} by ${entry.updatedBy || 'unknown'}`
                  : 'No entry recorded for this date.'}
              </div>
              <button
                onClick={() => handleRevenueSaveFromHook(laundry.id)}
                disabled={saving}
                className="px-4 py-2 rounded-md text-xs font-semibold border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save entry'}
              </button>
            </div>

            {entryAudit.length > 0 && (
              <div className="text-xs text-slate-500 border-t border-slate-700 pt-3 space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Audit log</div>
                {entryAudit.filter(item => item.oldValue !== null).slice(0, 6).map(item => (
                  <div key={`${item.id}-${item.createdAt}`} className="flex flex-wrap justify-between gap-2">
                    <span>{getFieldLabel(item.field)}: {item.oldValue} → {item.newValue}</span>
                    <span>{item.user} · {formatTimestamp(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderRevenueAll = () => {
    const laundryNameMap = new Map(laundries.map(l => [l.id, l.name]));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400">{revenueAllEntries.length} entries</div>
          <button
            onClick={handleExportRevenueCsv}
            disabled={revenueAllLoading || revenueAllEntries.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {revenueAllError && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-3 py-2 rounded-lg text-sm">
            {revenueAllError}
          </div>
        )}

        {revenueAllLoading && (
          <div className="text-sm text-slate-400">Loading revenue entries...</div>
        )}

        {!revenueAllLoading && revenueAllEntries.length === 0 && (
          <div className="text-sm text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700 p-4">
            No entries yet.
          </div>
        )}

        {!revenueAllLoading && revenueAllEntries.length > 0 && (
          <>
            <div className="space-y-3 md:hidden">
              {revenueAllEntries.map(entry => (
                <div key={`${entry.agentId}-${entry.entryDate}`} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{entry.entryDate}</div>
                    <div className="text-[11px] text-slate-400">{laundryNameMap.get(entry.agentId) || entry.agentId}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mt-2">
                    <div>Revenue: €{formatMoney(entry.coinsTotal)}</div>
                    <div>€1 count: {entry.euroCoinsCount}</div>
                    <div>Bills: €{formatMoney(entry.billsTotal)}</div>
                    <div>Deductions: €{formatMoney(entry.deductionsTotal)}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2">
                    Updated {formatTimestamp(entry.updatedAt)} · {entry.updatedBy || 'unknown'}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto border border-slate-700 rounded-xl">
              <table className="min-w-[900px] w-full text-xs text-slate-200">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Laundry</th>
                    <th className="px-3 py-2 text-right">Revenue (€)</th>
                    <th className="px-3 py-2 text-right">€1 count</th>
                    <th className="px-3 py-2 text-right">Bills (€)</th>
                    <th className="px-3 py-2 text-right">Deductions (€)</th>
                    <th className="px-3 py-2 text-left">Updated by</th>
                    <th className="px-3 py-2 text-left">Updated at</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueAllEntries.map(entry => (
                    <tr key={`${entry.agentId}-${entry.entryDate}`} className="border-t border-slate-700">
                      <td className="px-3 py-2">{entry.entryDate}</td>
                      <td className="px-3 py-2">{laundryNameMap.get(entry.agentId) || entry.agentId}</td>
                      <td className="px-3 py-2 text-right">€{formatMoney(entry.coinsTotal)}</td>
                      <td className="px-3 py-2 text-right">{entry.euroCoinsCount}</td>
                      <td className="px-3 py-2 text-right">€{formatMoney(entry.billsTotal)}</td>
                      <td className="px-3 py-2 text-right">€{formatMoney(entry.deductionsTotal)}</td>
                      <td className="px-3 py-2">{entry.updatedBy || 'unknown'}</td>
                      <td className="px-3 py-2">{formatTimestamp(entry.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRevenue = () => {
    if (authUser?.role !== 'admin') {
      return (
        <div className="text-center py-16 text-slate-500">
          Finance management is available to admin users only.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Finance
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1 w-full sm:w-auto justify-between">
              <button
                onClick={() => setRevenueView('daily')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex-1 sm:flex-none ${
                  revenueView === 'daily' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setRevenueView('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex-1 sm:flex-none ${
                  revenueView === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All entries
              </button>
              <button
                onClick={() => setRevenueView('bankImport')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex-1 sm:flex-none flex items-center gap-1 ${
                  revenueView === 'bankImport' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Upload className="w-3 h-3" />
                Bank Import
              </button>
            </div>
          </div>
        </div>
        {revenueView === 'daily' && renderRevenueDaily()}
        {revenueView === 'all' && renderRevenueAll()}
        {revenueView === 'bankImport' && (
          <BankImportView
            laundries={laundries}
            imports={bankImports}
            activeImport={bankActiveImport}
            transactions={bankTransactions}
            summary={bankSummary}
            loading={bankLoading}
            uploading={bankUploading}
            applying={bankApplying}
            error={bankError}
            pendingChanges={bankPendingChanges}
            hasUnsavedChanges={bankHasUnsavedChanges}
            onUploadCsv={onBankUploadCsv}
            onLoadImport={onBankLoadImport}
            onAssignTransaction={onBankAssignTransaction}
            onAssignStripeCredit={onBankAssignStripeCredit}
            onIgnoreTransaction={onBankIgnoreTransaction}
            onUnignoreTransaction={onBankUnignoreTransaction}
            onUndoChange={onBankUndoChange}
            onApplyChanges={onBankApplyChanges}
            onCompleteImport={onBankCompleteImport}
            onCancelImport={onBankCancelImport}
            onDeleteImport={onBankDeleteImport}
            onClearActiveImport={onBankClearActiveImport}
          />
        )}
      </div>
    );
  };

  return renderRevenue();
};
