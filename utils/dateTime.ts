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

export const normalizeTimeInput = (val: string): string => {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

export const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateParts = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

export const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

export const shiftDateByDays = (value: string, delta: number) => {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + delta);
  return toDateInput(date);
};

export const shiftDateByMonths = (value: string, delta: number) => {
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

export const getMonthRange = (value: string) => {
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatShortDate = (value: string): string => {
  const parts = parseDateParts(value);
  if (!parts) return value;
  return `${SHORT_MONTHS[parts.month - 1]} ${parts.day}`;
};
