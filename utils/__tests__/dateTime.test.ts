import { describe, it, expect } from 'vitest';
import {
  to24h,
  normalizeTimeInput,
  toDateInput,
  parseDateParts,
  getDaysInMonth,
  shiftDateByDays,
  shiftDateByMonths,
  getMonthRange,
} from '../dateTime';

describe('to24h', () => {
  describe('12-hour format conversion', () => {
    it('should convert AM times correctly', () => {
      expect(to24h('12:00 AM')).toBe('00:00');
      expect(to24h('1:00 AM')).toBe('01:00');
      expect(to24h('11:59 AM')).toBe('11:59');
      expect(to24h('6:30 am')).toBe('06:30');
    });

    it('should convert PM times correctly', () => {
      expect(to24h('12:00 PM')).toBe('12:00');
      expect(to24h('1:00 PM')).toBe('13:00');
      expect(to24h('11:59 PM')).toBe('23:59');
      expect(to24h('6:30 pm')).toBe('18:30');
    });

    it('should handle times with seconds', () => {
      expect(to24h('1:30:45 PM')).toBe('13:30');
      expect(to24h('12:00:00 AM')).toBe('00:00');
    });
  });

  describe('24-hour format handling', () => {
    it('should normalize 24-hour format', () => {
      expect(to24h('00:00')).toBe('00:00');
      expect(to24h('09:30')).toBe('09:30');
      expect(to24h('23:59')).toBe('23:59');
      expect(to24h('9:05')).toBe('09:05');
    });

    it('should handle times with seconds', () => {
      expect(to24h('13:30:45')).toBe('13:30');
    });

    it('should clamp invalid hours and minutes', () => {
      expect(to24h('25:00')).toBe('23:00');
      expect(to24h('12:99')).toBe('12:59');
    });
  });

  describe('edge cases', () => {
    it('should return null for null input', () => {
      expect(to24h(null)).toBe(null);
    });

    it('should return null for undefined input', () => {
      expect(to24h(undefined)).toBe(null);
    });

    it('should return null for empty string', () => {
      expect(to24h('')).toBe(null);
    });

    it('should return null for invalid format', () => {
      expect(to24h('invalid')).toBe(null);
      expect(to24h('25')).toBe(null);
      expect(to24h('12')).toBe(null);
    });

    it('should handle whitespace', () => {
      expect(to24h('  9:30  ')).toBe('09:30');
      expect(to24h('  1:00 PM  ')).toBe('13:00');
    });
  });
});

describe('normalizeTimeInput', () => {
  it('should format digits into HH:MM format', () => {
    expect(normalizeTimeInput('1234')).toBe('12:34');
    expect(normalizeTimeInput('0930')).toBe('09:30');
  });

  it('should handle partial input', () => {
    expect(normalizeTimeInput('1')).toBe('1');
    expect(normalizeTimeInput('12')).toBe('12');
    expect(normalizeTimeInput('123')).toBe('12:3');
  });

  it('should strip non-digits', () => {
    expect(normalizeTimeInput('12:34')).toBe('12:34');
    expect(normalizeTimeInput('12-34')).toBe('12:34');
    expect(normalizeTimeInput('ab12cd34')).toBe('12:34');
  });

  it('should limit to 4 digits', () => {
    expect(normalizeTimeInput('123456')).toBe('12:34');
    expect(normalizeTimeInput('99999999')).toBe('99:99');
  });

  it('should handle empty input', () => {
    expect(normalizeTimeInput('')).toBe('');
  });
});

describe('toDateInput', () => {
  it('should format date to YYYY-MM-DD', () => {
    expect(toDateInput(new Date(2024, 0, 15))).toBe('2024-01-15');
    expect(toDateInput(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('should pad single digit months and days', () => {
    expect(toDateInput(new Date(2024, 0, 1))).toBe('2024-01-01');
    expect(toDateInput(new Date(2024, 8, 5))).toBe('2024-09-05');
  });
});

describe('parseDateParts', () => {
  it('should parse valid date strings', () => {
    expect(parseDateParts('2024-01-15')).toEqual({ year: 2024, month: 1, day: 15 });
    expect(parseDateParts('2024-12-31')).toEqual({ year: 2024, month: 12, day: 31 });
  });

  it('should return null for invalid format', () => {
    expect(parseDateParts('2024/01/15')).toBe(null);
    expect(parseDateParts('01-15-2024')).toBe(null);
    expect(parseDateParts('invalid')).toBe(null);
    expect(parseDateParts('')).toBe(null);
  });

  it('should return null for invalid month', () => {
    expect(parseDateParts('2024-00-15')).toBe(null);
    expect(parseDateParts('2024-13-15')).toBe(null);
  });

  it('should return null for invalid day', () => {
    expect(parseDateParts('2024-01-00')).toBe(null);
    expect(parseDateParts('2024-01-32')).toBe(null);
  });
});

describe('getDaysInMonth', () => {
  it('should return correct days for each month', () => {
    expect(getDaysInMonth(2024, 1)).toBe(31); // January
    expect(getDaysInMonth(2024, 2)).toBe(29); // February (leap year)
    expect(getDaysInMonth(2023, 2)).toBe(28); // February (non-leap year)
    expect(getDaysInMonth(2024, 4)).toBe(30); // April
    expect(getDaysInMonth(2024, 12)).toBe(31); // December
  });
});

describe('shiftDateByDays', () => {
  it('should shift date forward', () => {
    expect(shiftDateByDays('2024-01-15', 1)).toBe('2024-01-16');
    expect(shiftDateByDays('2024-01-15', 7)).toBe('2024-01-22');
  });

  it('should shift date backward', () => {
    expect(shiftDateByDays('2024-01-15', -1)).toBe('2024-01-14');
    expect(shiftDateByDays('2024-01-15', -7)).toBe('2024-01-08');
  });

  it('should handle month boundaries', () => {
    expect(shiftDateByDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(shiftDateByDays('2024-02-01', -1)).toBe('2024-01-31');
  });

  it('should handle year boundaries', () => {
    expect(shiftDateByDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(shiftDateByDays('2024-01-01', -1)).toBe('2023-12-31');
  });

  it('should return original value for invalid date', () => {
    expect(shiftDateByDays('invalid', 1)).toBe('invalid');
    expect(shiftDateByDays('', 1)).toBe('');
  });
});

describe('shiftDateByMonths', () => {
  it('should shift date forward by months', () => {
    expect(shiftDateByMonths('2024-01-15', 1)).toBe('2024-02-15');
    expect(shiftDateByMonths('2024-01-15', 3)).toBe('2024-04-15');
  });

  it('should shift date backward by months', () => {
    expect(shiftDateByMonths('2024-03-15', -1)).toBe('2024-02-15');
    expect(shiftDateByMonths('2024-03-15', -3)).toBe('2023-12-15');
  });

  it('should handle year boundaries', () => {
    expect(shiftDateByMonths('2024-12-15', 1)).toBe('2025-01-15');
    expect(shiftDateByMonths('2024-01-15', -1)).toBe('2023-12-15');
  });

  it('should clamp day to max days in target month', () => {
    expect(shiftDateByMonths('2024-01-31', 1)).toBe('2024-02-29'); // Feb in leap year
    expect(shiftDateByMonths('2023-01-31', 1)).toBe('2023-02-28'); // Feb in non-leap year
    expect(shiftDateByMonths('2024-03-31', 1)).toBe('2024-04-30'); // April has 30 days
  });

  it('should return original value for invalid date', () => {
    expect(shiftDateByMonths('invalid', 1)).toBe('invalid');
    expect(shiftDateByMonths('', 1)).toBe('');
  });
});

describe('getMonthRange', () => {
  it('should return correct range for a month', () => {
    const result = getMonthRange('2024-01-15');
    expect(result).toEqual({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      year: 2024,
      month: 1,
      daysInMonth: 31,
    });
  });

  it('should handle February in leap year', () => {
    const result = getMonthRange('2024-02-15');
    expect(result).toEqual({
      startDate: '2024-02-01',
      endDate: '2024-02-29',
      year: 2024,
      month: 2,
      daysInMonth: 29,
    });
  });

  it('should handle February in non-leap year', () => {
    const result = getMonthRange('2023-02-15');
    expect(result).toEqual({
      startDate: '2023-02-01',
      endDate: '2023-02-28',
      year: 2023,
      month: 2,
      daysInMonth: 28,
    });
  });

  it('should return null for invalid date', () => {
    expect(getMonthRange('invalid')).toBe(null);
    expect(getMonthRange('')).toBe(null);
  });
});
