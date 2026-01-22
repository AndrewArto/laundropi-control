/**
 * Shared time formatting utilities
 * Extracted from App.tsx and server/index.ts to eliminate duplication
 */

/**
 * Convert time to 24-hour format
 * Handles both 12-hour (AM/PM) and 24-hour formats
 */
export const to24h = (val?: string | null): string | null => {
  if (!val) return null;
  const raw = val.trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let hh = parseInt(ampm[1], 10);
    const mm = ampm[2];
    const suffix = ampm[3].toUpperCase();
    if (suffix === 'PM' && hh !== 12) hh += 12;
    if (suffix === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    const hh = Math.min(Math.max(parseInt(hhmm[1], 10), 0), 23);
    const mm = Math.min(Math.max(parseInt(hhmm[2], 10), 0), 59);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return null;
};

/**
 * Normalize time input by adding colon separator
 * Input: "1230" -> Output: "12:30"
 */
export const normalizeTimeInput = (val: string): string => {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

/**
 * Convert Date object to YYYY-MM-DD string
 */
export const toDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse date string into components
 * Returns null if invalid format
 */
export const parseDateParts = (value: string): { year: number; month: number; day: number } | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

/**
 * Get number of days in a month
 */
export const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

/**
 * Shift date by specified number of days
 */
export const shiftDateByDays = (value: string, delta: number): string => {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + delta);
  return toDateInput(date);
};

/**
 * Shift date by specified number of months
 */
export const shiftDateByMonths = (value: string, delta: number): string => {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const base = new Date(parts.year, parts.month - 1, 1);
  base.setMonth(base.getMonth() + delta);
  const nextYear = base.getFullYear();
  const nextMonth = base.getMonth() + 1;
  const maxDay = getDaysInMonth(nextYear, nextMonth);
  const day = Math.min(parts.day, maxDay);
  return toDateInput(new Date(nextYear, nextMonth - 1, day));
};

/**
 * Get start and end dates for a given month
 */
export const getMonthRange = (value: string): {
  startDate: string;
  endDate: string;
  year: number;
  month: number;
  daysInMonth: number;
} | null => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const daysInMonth = getDaysInMonth(parts.year, parts.month);
  const monthStr = String(parts.month).padStart(2, '0');
  return {
    startDate: `${parts.year}-${monthStr}-01`,
    endDate: `${parts.year}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`,
    year: parts.year,
    month: parts.month,
    daysInMonth,
  };
};

/**
 * Format number as money string (2 decimal places)
 */
export const formatMoney = (value?: number | null): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

/**
 * Format timestamp as locale string
 */
export const formatTimestamp = (ts: number): string => {
  return new Date(ts).toLocaleString();
};

/**
 * Format last login timestamp
 */
export const formatLastLogin = (ts: number | null): string => {
  return ts ? formatTimestamp(ts) : 'Never';
};

/**
 * Check if input is valid numeric revenue input
 */
export const isRevenueNumericInput = (value: string): boolean => {
  return /^(\d+([.,]\d*)?|[.,]\d*)?$/.test(value);
};

/**
 * Normalize decimal input (replace comma with period)
 */
export const normalizeDecimalInput = (value: string): string => {
  return value.replace(',', '.');
};

/**
 * Generate unique deduction ID
 */
export const makeDeductionId = (): string => {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
