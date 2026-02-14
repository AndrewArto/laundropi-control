import React, { useState, useEffect, useCallback } from 'react';
import { Coins, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, Download, CalendarClock, Upload, Building2, TrendingUp, WashingMachine, FileText } from 'lucide-react';
import { RevenueEntry, RevenueAuditEntry, RevenueSummary, UiUser, ExpenditureImport, ExpenditureTransaction, GENERAL_AGENT_ID, GENERAL_LAUNDRY } from '../../types';
import type { DateEntryInfo } from '../../hooks/useRevenue';
import { BankImportView } from './BankImportView';
import { InvoicingView } from './InvoicingView';
import type { ReconciliationSummary, PendingChange } from '../../hooks/useReconciliation';
import { ApiService } from '../../services/api';
import { formatShortDate } from '../../utils/dateTime';
import { getEntryRevenue, filterRevenueEntries, filterRevenueByType, sortRevenueEntries } from '../../utils/revenue';

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
        <div className={`${large ? 'text-base' : 'text-[10px]'} text-white`}>−€{formatMoney(costs)}</div>
        <div className={`${large ? 'text-lg' : 'text-xs'} font-semibold ${profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          P/L {profitLoss >= 0 ? '' : '−'}€{formatMoney(Math.abs(profitLoss))}
        </div>
      </div>
    </div>
  );
};

// Line chart component for monthly revenue/costs/P&L visualization
interface LineChartDataPoint {
  date: string;
  revenue: number;
  costs: number;
  profitLoss: number;
}

interface LineChartProps {
  data: LineChartDataPoint[];
  formatMoney: (val: number) => string;
}

const MonthlyLineChart: React.FC<LineChartProps> = ({ data, formatMoney }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  if (data.length === 0) {
    return <div className="text-sm text-slate-400 p-4">No data available for this month.</div>;
  }

  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Filter valid data points (non-NaN) for calculating scales
  const validData = data.filter(d => !isNaN(d.revenue));
  const allValues = validData.flatMap(d => [d.revenue, d.costs, d.profitLoss]);
  const minValue = Math.min(0, ...allValues);
  const maxValue = Math.max(...allValues);
  const valueRange = maxValue - minValue || 1;

  // Scale functions - use full data length for X to show full month
  const xScale = (index: number) => padding.left + (index / (data.length - 1 || 1)) * chartWidth;
  const yScale = (value: number) => padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

  // Generate path strings - only for valid (non-NaN) values
  const generatePath = (getValue: (d: LineChartDataPoint) => number) => {
    let pathStarted = false;
    return data.map((d, i) => {
      const v = getValue(d);
      if (isNaN(v)) return '';
      const x = xScale(i);
      const y = yScale(v);
      if (!pathStarted) {
        pathStarted = true;
        return `M ${x} ${y}`;
      }
      return `L ${x} ${y}`;
    }).join(' ');
  };

  const revenuePath = generatePath(d => d.revenue);
  const costsPath = generatePath(d => d.costs);
  const plPath = generatePath(d => d.profitLoss);

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => minValue + (valueRange * i) / yTicks);

  // X-axis labels (show every few days to avoid crowding)
  const xLabelInterval = Math.max(1, Math.floor(data.length / 6));

  // Handle mouse move on chart
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * width;
    // Find closest data point index
    const relX = svgX - padding.left;
    const index = Math.round((relX / chartWidth) * (data.length - 1));
    if (index >= 0 && index < data.length) {
      setHoverIndex(index);
    }
  };

  const handleMouseLeave = () => setHoverIndex(null);

  const hoverData = hoverIndex !== null ? data[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xScale(hoverIndex) : 0;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[600px] w-full h-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid lines */}
        {yTickValues.map((val, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={yScale(val)}
            x2={width - padding.right}
            y2={yScale(val)}
            stroke="currentColor"
            strokeOpacity={0.1}
            className="text-slate-600"
          />
        ))}

        {/* Zero line */}
        {minValue < 0 && (
          <line
            x1={padding.left}
            y1={yScale(0)}
            x2={width - padding.right}
            y2={yScale(0)}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeDasharray="4 2"
            className="text-slate-400"
          />
        )}

        {/* Y-axis labels */}
        {yTickValues.map((val, i) => (
          <text
            key={i}
            x={padding.left - 8}
            y={yScale(val)}
            textAnchor="end"
            dominantBaseline="middle"
            className="text-[10px] fill-slate-500"
          >
            €{formatMoney(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (i % xLabelInterval !== 0 && i !== data.length - 1) return null;
          const day = d.date.split('-')[2];
          return (
            <text
              key={i}
              x={xScale(i)}
              y={height - padding.bottom + 20}
              textAnchor="middle"
              className="text-[10px] fill-slate-500"
            >
              {day}
            </text>
          );
        })}

        {/* Revenue line (white) */}
        <path
          d={revenuePath}
          fill="none"
          stroke="white"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Costs line (red) */}
        <path
          d={costsPath}
          fill="none"
          stroke="#f87171"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* P/L line (green/emerald) */}
        <path
          d={plPath}
          fill="none"
          stroke="#34d399"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Data points - only for valid (non-NaN) values */}
        {data.map((d, i) => {
          if (isNaN(d.revenue)) return null;
          return (
            <g key={i}>
              <circle cx={xScale(i)} cy={yScale(d.revenue)} r={3} fill="white" />
              <circle cx={xScale(i)} cy={yScale(d.costs)} r={3} fill="#f87171" />
              <circle cx={xScale(i)} cy={yScale(d.profitLoss)} r={3} fill="#34d399" />
            </g>
          );
        })}

        {/* Crosshair */}
        {hoverIndex !== null && hoverData && !isNaN(hoverData.revenue) && (
          <g>
            {/* Vertical line */}
            <line
              x1={hoverX}
              y1={padding.top}
              x2={hoverX}
              y2={height - padding.bottom}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            {/* Highlighted points */}
            <circle cx={hoverX} cy={yScale(hoverData.revenue)} r={5} fill="white" stroke="#1e293b" strokeWidth={2} />
            <circle cx={hoverX} cy={yScale(hoverData.costs)} r={5} fill="#f87171" stroke="#1e293b" strokeWidth={2} />
            <circle cx={hoverX} cy={yScale(hoverData.profitLoss)} r={5} fill="#34d399" stroke="#1e293b" strokeWidth={2} />
          </g>
        )}
      </svg>

      {/* Tooltip / Values display */}
      {hoverIndex !== null && hoverData && !isNaN(hoverData.revenue) && (
        <div className="flex gap-4 justify-center mt-1 text-xs bg-slate-900/80 rounded px-3 py-1.5">
          <span className="text-slate-400">{hoverData.date.split('-')[2]}/{hoverData.date.split('-')[1]}</span>
          <span className="text-white">Rev: €{formatMoney(hoverData.revenue)}</span>
          <span className="text-white">Cost: −€{formatMoney(hoverData.costs)}</span>
          <span className={hoverData.profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            P/L: {hoverData.profitLoss >= 0 ? '' : '−'}€{formatMoney(Math.abs(hoverData.profitLoss))}
          </span>
        </div>
      )}

      {/* Legend (show when not hovering) */}
      {hoverIndex === null && (
        <div className="flex gap-4 justify-center mt-2 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-white" />
            <span className="text-slate-400">Revenue</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-red-400" />
            <span className="text-slate-400">Costs</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-emerald-400" />
            <span className="text-slate-400">P/L</span>
          </div>
        </div>
      )}
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
  revenueView: 'daily' | 'all' | 'bankImport' | 'invoicing';
  setRevenueView: React.Dispatch<React.SetStateAction<'daily' | 'all' | 'bankImport' | 'invoicing'>>;
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

  // Monthly line chart state
  const [chartExpanded, setChartExpanded] = useState(false);
  const [chartData, setChartData] = useState<LineChartDataPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // All-entries sort & filter state
  const [allSort, setAllSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'entryDate', dir: 'desc' });
  const [allFilters, setAllFilters] = useState<Record<string, string>>({});

  // Column visibility
  const ALL_COLUMNS = [
    { key: 'entryDate', label: 'Date', align: 'left' as const, defaultVisible: true },
    { key: 'agentId', label: 'Laundry', align: 'left' as const, defaultVisible: true },
    { key: 'coinsTotal', label: 'Revenue (€)', align: 'right' as const, defaultVisible: true },
    { key: 'euroCoinsCount', label: '€1 count', align: 'right' as const, defaultVisible: true },
    { key: 'billsTotal', label: 'Bills (€)', align: 'right' as const, defaultVisible: false },
    { key: 'deductionsTotal', label: 'Deductions (€)', align: 'right' as const, defaultVisible: true },
    { key: 'updatedBy', label: 'Updated by', align: 'left' as const, defaultVisible: true },
    { key: 'updatedAt', label: 'Updated at', align: 'left' as const, defaultVisible: true },
  ] as const;

  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  );
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'income' | 'deductions'>('all');

  // Viewer role check - viewers can see data but not edit
  const isViewer = props.authUser?.role === 'viewer';

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

  // Fetch monthly chart data when expanded (cumulative, up to selected date)
  const fetchChartData = useCallback(async (startDate: string, endDate: string, currentDate: string) => {
    setChartLoading(true);
    try {
      // Only fetch entries up to the current selected date
      const entries = await ApiService.listRevenueEntries({ startDate, endDate: currentDate });

      // Group entries by date and sum up daily revenue/costs/P&L
      const dailyMap = new Map<string, { revenue: number; costs: number; profitLoss: number }>();

      // Initialize all days in the full month range (for X-axis)
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dailyMap.set(dateStr, { revenue: 0, costs: 0, profitLoss: 0 });
      }

      // Aggregate entries per day (all agents' deductions are already included in each entry)
      for (const entry of entries) {
        const existing = dailyMap.get(entry.entryDate) || { revenue: 0, costs: 0, profitLoss: 0 };
        const revenue = getEntryRevenue(entry);
        const costs = entry.deductionsTotal || 0;
        existing.revenue += revenue;
        existing.costs += costs;
        existing.profitLoss += revenue - costs;
        dailyMap.set(entry.entryDate, existing);
      }

      // Convert to array sorted by date, then make cumulative up to currentDate
      const sortedDaily = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      let cumRevenue = 0;
      let cumCosts = 0;
      let cumPL = 0;
      const chartPoints: LineChartDataPoint[] = sortedDaily.map(([date, values]) => {
        // Only accumulate values up to and including currentDate
        if (date <= currentDate) {
          cumRevenue += values.revenue;
          cumCosts += values.costs;
          cumPL += values.profitLoss;
          return { date, revenue: cumRevenue, costs: cumCosts, profitLoss: cumPL };
        }
        // Future dates: return null values (will be filtered in chart)
        return { date, revenue: NaN, costs: NaN, profitLoss: NaN };
      });

      setChartData(chartPoints);
    } catch (err) {
      console.error('Failed to fetch chart data', err);
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // Load chart data when expanded or date changes
  useEffect(() => {
    if (chartExpanded && props.revenueSummary) {
      fetchChartData(props.revenueSummary.month.startDate, props.revenueSummary.month.endDate, props.revenueDate);
    }
  }, [chartExpanded, props.revenueSummary, props.revenueDate, fetchChartData]);

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
            const hasStripe = dateInfo?.hasStripeRevenue ?? false;
            const hasManual = dateInfo?.hasManualRevenue ?? false;
            // Green = manual incassation, Blue = stripe only, manual takes priority
            const revenueDotColor = hasManual ? 'bg-emerald-400' : hasStripe ? 'bg-blue-400' : 'bg-emerald-400';
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
                    {hasRevenue && <span className={`w-1.5 h-1.5 rounded-full ${revenueDotColor}`} />}
                    {hasExpenses && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Manual
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Stripe
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
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setChartExpanded(prev => !prev)}
            className="flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white sm:justify-start"
            aria-expanded={chartExpanded}
          >
            <span className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trend
            </span>
            {chartExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isRevenueCalendarOpen && renderRevenueCalendar()}

      {/* Monthly Line Chart (when expanded via Trend button) - before pie charts */}
      {chartExpanded && revenueSummary && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-3">
            Cumulative trend: {revenueSummary.month.startDate} → {revenueSummary.month.endDate}
          </div>
          {chartLoading ? (
            <div className="text-sm text-slate-400 py-4">Loading chart data...</div>
          ) : (
            <MonthlyLineChart data={chartData} formatMoney={formatMoney} />
          )}
        </div>
      )}

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
                className="w-full p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  )}
                  <Building2 className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">{laundry.name}</div>
                    {!isExpanded && (
                      <div className="text-xs text-slate-500 hidden sm:block">Click to expand</div>
                    )}
                  </div>
                </div>

                {/* Summary columns - responsive layout, aligned with laundry sections */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 pl-8 sm:pl-0">
                  {/* Selected date's cost - matches date column width */}
                  <div className="flex flex-col items-start flex-shrink-0 sm:w-[70px]">
                    <div className="text-[10px] text-purple-400/70 uppercase tracking-wide">{formatShortDate(revenueDate)}</div>
                    <div className="text-sm text-white">−€{formatMoney(totalCosts)}</div>
                  </div>
                  {/* Week - matches DonutChart width */}
                  <div className="flex flex-col items-start flex-shrink-0 sm:w-[140px]">
                    <div className="text-[10px] text-purple-400/70 uppercase tracking-wide">Week</div>
                    <div className="text-sm text-white">−€{formatMoney(weekFixCosts)}</div>
                  </div>
                  {/* Month - matches DonutChart width */}
                  <div className="flex flex-col items-start flex-shrink-0 sm:w-[140px]">
                    <div className="text-[10px] text-purple-400/70 uppercase tracking-wide">Month</div>
                    <div className="text-sm text-white">−€{formatMoney(monthFixCosts)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-auto">
                    <span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${
                      entry?.hasEdits
                        ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                        : entry
                          ? 'border-green-500/50 text-green-300 bg-green-500/10'
                          : 'border-purple-500/50 text-purple-300 bg-purple-500/10'
                    }`}>
                      {entry?.hasEdits ? 'Edited' : entry ? 'Entry loaded' : 'No entry yet'}
                    </span>
                  </div>
                </div>
              </button>

              {/* Collapsible content */}
              {isExpanded && (
                <div className="p-4 pt-0 space-y-4 border-t border-purple-500/30">
                  <div className="space-y-2 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-300">Costs (comment required)</div>
                      {!isViewer && (
                        <button
                          onClick={() => addRevenueDeductionFromHook(laundry.id)}
                          className="text-xs px-2 py-1 rounded-md border border-purple-500/50 text-purple-300 hover:border-purple-400 hover:text-purple-200 transition-colors"
                        >
                          Add cost
                        </button>
                      )}
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
                          disabled={isViewer}
                          onChange={(e) => {
                            const nextValue = e.target.value;
                            if (!isRevenueNumericInput(nextValue)) return;
                            updateRevenueDraftFromHook(laundry.id, d => ({
                              ...d,
                              deductions: d.deductions.map(row => row.id === item.id ? { ...row, amount: nextValue } : row),
                            }));
                          }}
                          className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[120px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="0.00"
                        />
                        <input
                          type="text"
                          value={item.comment}
                          disabled={isViewer}
                          onChange={(e) => updateRevenueDraftFromHook(laundry.id, d => ({
                            ...d,
                            deductions: d.deductions.map(row => row.id === item.id ? { ...row, comment: e.target.value } : row),
                          }))}
                          className="flex-[2] min-w-0 w-full sm:w-auto sm:min-w-[200px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          placeholder="Reason"
                        />
                        {!isViewer && (
                          <button
                            onClick={() => removeRevenueDeductionFromHook(laundry.id, item.id)}
                            className="text-xs px-3 py-2 w-full sm:w-auto rounded-md border border-red-500/40 text-red-300 hover:text-red-200 hover:border-red-400 transition-colors"
                          >
                            Remove
                          </button>
                        )}
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
                    {!isViewer && (
                      <button
                        onClick={() => handleRevenueSaveFromHook(laundry.id)}
                        disabled={saving}
                        className="px-4 py-2 rounded-md text-xs font-semibold border border-purple-500 text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save costs'}
                      </button>
                    )}
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
        const todayRevenue = entry?.coinsTotal ?? 0;
        const todayCosts = entry?.deductionsTotal ?? 0;

        return (
          <div key={laundry.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {/* Collapsible header */}
            <button
              onClick={() => toggleAgentExpanded(laundry.id)}
              className="w-full p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                )}
                <WashingMachine className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-white">{laundry.name}</div>
                  {!isExpanded && (
                    <div className="text-xs text-slate-500 hidden sm:block">Click to expand</div>
                  )}
                </div>
              </div>

              {/* Summary: Selected date + Week/Month pie charts - responsive layout */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 pl-8 sm:pl-0">
                {/* Selected date's values */}
                <div className="flex flex-col items-start flex-shrink-0 sm:w-[70px]">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wide">{formatShortDate(revenueDate)}</div>
                  <div className="text-sm text-white">€{formatMoney(todayRevenue)}</div>
                  <div className="text-xs text-white">−€{formatMoney(todayCosts)}</div>
                </div>
                <div className="flex-shrink-0 sm:w-[140px]">
                  <DonutChart
                    revenue={weekTotal}
                    costs={weekCosts}
                    size={50}
                    label="Week"
                    profitLoss={weekProfitLoss}
                    formatMoney={formatMoney}
                  />
                </div>
                <div className="flex-shrink-0 sm:w-[140px]">
                  <DonutChart
                    revenue={monthTotal}
                    costs={monthCosts}
                    size={50}
                    label="Month"
                    profitLoss={monthProfitLoss}
                    formatMoney={formatMoney}
                  />
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-auto">
                  <span className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${
                    entry?.hasEdits
                      ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                      : entry
                        ? 'border-green-500/50 text-green-300 bg-green-500/10'
                        : 'border-slate-600 text-slate-300 bg-slate-900/40'
                  }`}>
                    {entry?.hasEdits ? 'Edited' : entry ? 'Entry loaded' : 'No entry yet'}
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
                  disabled={isViewer}
                  onFocus={(e) => {
                    if (e.target.value === '0.00' || e.target.value === '0') {
                      updateRevenueDraftFromHook(laundry.id, d => ({ ...d, coinsTotal: '' }));
                    }
                  }}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraftFromHook(laundry.id, d => ({ ...d, coinsTotal: nextValue }));
                  }}
                  className={`${fieldClass(Boolean(coinsAudit))} disabled:opacity-60 disabled:cursor-not-allowed`}
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
                  disabled={isViewer}
                  onFocus={(e) => {
                    if (e.target.value === '0') {
                      updateRevenueDraftFromHook(laundry.id, d => ({ ...d, euroCoinsCount: '' }));
                    }
                  }}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraftFromHook(laundry.id, d => ({ ...d, euroCoinsCount: nextValue }));
                  }}
                  className={`${fieldClass(Boolean(countAudit))} disabled:opacity-60 disabled:cursor-not-allowed`}
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
                  disabled={isViewer}
                  onFocus={(e) => {
                    if (e.target.value === '0.00' || e.target.value === '0') {
                      updateRevenueDraftFromHook(laundry.id, d => ({ ...d, billsTotal: '' }));
                    }
                  }}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraftFromHook(laundry.id, d => ({ ...d, billsTotal: nextValue }));
                  }}
                  className={`${fieldClass(Boolean(billsAudit))} disabled:opacity-60 disabled:cursor-not-allowed`}
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
                {!isViewer && (
                  <button
                    onClick={() => addRevenueDeductionFromHook(laundry.id)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                  >
                    Add deduction
                  </button>
                )}
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
                    disabled={isViewer}
                    onFocus={(e) => {
                      if (e.target.value === '0.00' || e.target.value === '0') {
                        updateRevenueDraftFromHook(laundry.id, d => ({
                          ...d,
                          deductions: d.deductions.map(row => row.id === item.id ? { ...row, amount: '' } : row),
                        }));
                      }
                    }}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      if (!isRevenueNumericInput(nextValue)) return;
                      updateRevenueDraftFromHook(laundry.id, d => ({
                        ...d,
                        deductions: d.deductions.map(row => row.id === item.id ? { ...row, amount: nextValue } : row),
                      }));
                    }}
                    className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[120px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="0.00"
                  />
                  <input
                    type="text"
                    value={item.comment}
                    disabled={isViewer}
                    onChange={(e) => updateRevenueDraftFromHook(laundry.id, d => ({
                      ...d,
                      deductions: d.deductions.map(row => row.id === item.id ? { ...row, comment: e.target.value } : row),
                    }))}
                    className="flex-[2] min-w-0 w-full sm:w-auto sm:min-w-[200px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Reason"
                  />
                  {!isViewer && (
                    <button
                      onClick={() => removeRevenueDeductionFromHook(laundry.id, item.id)}
                      className="text-xs px-3 py-2 w-full sm:w-auto rounded-md border border-red-500/40 text-red-300 hover:text-red-200 hover:border-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
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
              {!isViewer && (
                <button
                  onClick={() => handleRevenueSaveFromHook(laundry.id)}
                  disabled={saving}
                  className="px-4 py-2 rounded-md text-xs font-semibold border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save entry'}
                </button>
              )}
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

    // Filter and sort entries using extracted utility functions
    const filtered = filterRevenueByType(filterRevenueEntries(revenueAllEntries, allFilters), entryTypeFilter);
    const sorted = sortRevenueEntries(filtered, allSort);

    const handleSort = (col: string) => {
      setAllSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
    };

    const sortIcon = (col: string) => {
      if (allSort.col !== col) return ' ↕';
      return allSort.dir === 'asc' ? ' ▲' : ' ▼';
    };

    const filterInputClass = 'w-full bg-slate-900/80 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

    const hasActiveFilters = Object.values(allFilters).some(v => v !== '') || entryTypeFilter !== 'all';

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400">
              {filtered.length === revenueAllEntries.length
                ? `${revenueAllEntries.length} entries`
                : `${filtered.length} of ${revenueAllEntries.length} entries`}
            </div>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-700 bg-slate-900/60 p-0.5">
              {([['all', 'All'], ['income', 'Income'], ['deductions', 'Costs']] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setEntryTypeFilter(val)}
                  className={`px-2 py-1 text-xs rounded ${entryTypeFilter === val ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={() => { setAllFilters({}); setEntryTypeFilter('all'); }}
                className="px-2 py-1.5 text-xs rounded-md border border-amber-500/40 text-amber-300 hover:border-amber-400 hover:text-amber-200"
              >
                Clear filters
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setColPickerOpen(prev => !prev)}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white"
              >
                Columns
                <ChevronDown className={`w-3 h-3 transition-transform ${colPickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {colPickerOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 min-w-[160px]">
                  {ALL_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 rounded cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={visibleCols.has(col.key)}
                        onChange={() => {
                          setVisibleCols(prev => {
                            const next = new Set(prev);
                            if (next.has(col.key)) {
                              if (next.size > 1) next.delete(col.key);
                            } else {
                              next.add(col.key);
                            }
                            return next;
                          });
                        }}
                        className="rounded border-slate-500 bg-slate-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleExportRevenueCsv}
              disabled={revenueAllLoading || revenueAllEntries.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
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
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {/* Mobile filter controls */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={allFilters.agentId || ''}
                  onChange={e => setAllFilters(f => ({ ...f, agentId: e.target.value }))}
                  className={filterInputClass + ' flex-1 min-w-[120px]'}
                >
                  <option value="">All laundries</option>
                  {laundries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Date filter..."
                  value={allFilters.entryDate || ''}
                  onChange={e => setAllFilters(f => ({ ...f, entryDate: e.target.value }))}
                  className={filterInputClass + ' flex-1 min-w-[100px]'}
                />
              </div>
              <div className="space-y-3">
                {sorted.map(entry => (
                  <div key={`${entry.agentId}-${entry.entryDate}`} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      {visibleCols.has('entryDate') && <div className="text-sm font-semibold text-white">{entry.entryDate}</div>}
                      {visibleCols.has('agentId') && <div className="text-[11px] text-slate-400">{laundryNameMap.get(entry.agentId) || entry.agentId}</div>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mt-2">
                      {visibleCols.has('coinsTotal') && <div>Revenue: €{formatMoney(entry.coinsTotal)}</div>}
                      {visibleCols.has('euroCoinsCount') && <div>€1 count: {entry.euroCoinsCount}</div>}
                      {visibleCols.has('billsTotal') && <div>Bills: €{formatMoney(entry.billsTotal)}</div>}
                      {visibleCols.has('deductionsTotal') && <div>Deductions: €{formatMoney(entry.deductionsTotal)}</div>}
                    </div>
                    {(visibleCols.has('updatedAt') || visibleCols.has('updatedBy')) && (
                      <div className="text-[11px] text-slate-500 mt-2">
                        {visibleCols.has('updatedAt') && <>Updated {formatTimestamp(entry.updatedAt)}</>}
                        {visibleCols.has('updatedAt') && visibleCols.has('updatedBy') && ' · '}
                        {visibleCols.has('updatedBy') && <>{entry.updatedBy || 'unknown'}</>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto border border-slate-700 rounded-xl">
              <table className="min-w-[600px] w-full text-xs text-slate-200">
                <thead className="bg-slate-900/60">
                  <tr className="text-slate-400 uppercase tracking-wide">
                    {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                      <th key={col.key} className={`px-3 py-2 text-${col.align} cursor-pointer select-none hover:text-slate-200`} onClick={() => handleSort(col.key)}>
                        {col.label}{sortIcon(col.key)}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-t border-slate-700">
                    {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                      <th key={col.key} className="px-2 py-1">
                        {col.key === 'agentId' ? (
                          <select value={allFilters.agentId || ''} onChange={e => setAllFilters(f => ({ ...f, agentId: e.target.value }))} className={filterInputClass}>
                            <option value="">All</option>
                            {laundries.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        ) : col.key === 'updatedAt' ? null : (
                          col.align === 'right' ? (
                            <input type="text" inputMode="decimal" placeholder="Min" value={allFilters[col.key] || ''} onChange={e => setAllFilters(f => ({ ...f, [col.key]: e.target.value }))} className={filterInputClass + ' text-right'} />
                          ) : (
                            <input type="text" placeholder="Filter..." value={allFilters[col.key] || ''} onChange={e => setAllFilters(f => ({ ...f, [col.key]: e.target.value }))} className={filterInputClass} />
                          )
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(entry => {
                    const cellValues: Record<string, React.ReactNode> = {
                      entryDate: entry.entryDate,
                      agentId: laundryNameMap.get(entry.agentId) || entry.agentId,
                      coinsTotal: `€${formatMoney(entry.coinsTotal)}`,
                      euroCoinsCount: entry.euroCoinsCount,
                      billsTotal: `€${formatMoney(entry.billsTotal)}`,
                      deductionsTotal: `€${formatMoney(entry.deductionsTotal)}`,
                      updatedBy: entry.updatedBy || 'unknown',
                      updatedAt: formatTimestamp(entry.updatedAt),
                    };
                    return (
                      <tr key={`${entry.agentId}-${entry.entryDate}`} className="border-t border-slate-700">
                        {ALL_COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                          <td key={col.key} className={`px-3 py-2 text-${col.align}`}>{cellValues[col.key]}</td>
                        ))}
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr><td colSpan={visibleCols.size} className="px-3 py-4 text-center text-slate-500">No entries match filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRevenue = () => {
    // Viewers can see finance data but not edit
    // Only block users who are neither admin nor viewer
    if (authUser?.role !== 'admin' && authUser?.role !== 'viewer') {
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
              <button
                onClick={() => setRevenueView('invoicing')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex-1 sm:flex-none flex items-center gap-1 ${
                  revenueView === 'invoicing' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3 h-3" />
                Faturas
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
            isReadOnly={isViewer}
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
        {revenueView === 'invoicing' && (
          <InvoicingView />
        )}
      </div>
    );
  };

  return renderRevenue();
};
