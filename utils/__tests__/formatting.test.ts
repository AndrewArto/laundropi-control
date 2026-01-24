import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  makeDeductionId,
  formatTimestamp,
  formatLastLogin,
  isRevenueNumericInput,
  normalizeDecimalInput,
} from '../formatting';

describe('formatMoney', () => {
  it('should format positive numbers to 2 decimal places', () => {
    expect(formatMoney(100)).toBe('100.00');
    expect(formatMoney(100.5)).toBe('100.50');
    expect(formatMoney(100.555)).toBe('100.56');
    expect(formatMoney(0.1)).toBe('0.10');
  });

  it('should format zero correctly', () => {
    expect(formatMoney(0)).toBe('0.00');
  });

  it('should return 0.00 for null', () => {
    expect(formatMoney(null)).toBe('0.00');
  });

  it('should return 0.00 for undefined', () => {
    expect(formatMoney(undefined)).toBe('0.00');
  });

  it('should return 0.00 for non-finite values', () => {
    expect(formatMoney(NaN)).toBe('0.00');
    expect(formatMoney(Infinity)).toBe('0.00');
    expect(formatMoney(-Infinity)).toBe('0.00');
  });

  it('should format negative numbers', () => {
    expect(formatMoney(-50)).toBe('-50.00');
    expect(formatMoney(-50.5)).toBe('-50.50');
  });
});

describe('makeDeductionId', () => {
  it('should generate unique IDs', () => {
    const id1 = makeDeductionId();
    const id2 = makeDeductionId();
    expect(id1).not.toBe(id2);
  });

  it('should generate non-empty strings', () => {
    const id = makeDeductionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});

describe('formatTimestamp', () => {
  it('should format timestamp to locale string', () => {
    const ts = new Date('2024-01-15T10:30:00').getTime();
    const result = formatTimestamp(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatLastLogin', () => {
  it('should return formatted timestamp when provided', () => {
    const ts = new Date('2024-01-15T10:30:00').getTime();
    const result = formatLastLogin(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('Never');
  });

  it('should return Never for null', () => {
    expect(formatLastLogin(null)).toBe('Never');
  });
});

describe('isRevenueNumericInput', () => {
  it('should accept empty string', () => {
    expect(isRevenueNumericInput('')).toBe(true);
  });

  it('should accept whole numbers', () => {
    expect(isRevenueNumericInput('0')).toBe(true);
    expect(isRevenueNumericInput('123')).toBe(true);
    expect(isRevenueNumericInput('99999')).toBe(true);
  });

  it('should accept decimals with dot', () => {
    expect(isRevenueNumericInput('0.00')).toBe(true);
    expect(isRevenueNumericInput('123.45')).toBe(true);
    expect(isRevenueNumericInput('0.')).toBe(true);
    expect(isRevenueNumericInput('123.')).toBe(true);
  });

  it('should accept decimals with comma (European format)', () => {
    expect(isRevenueNumericInput('0,00')).toBe(true);
    expect(isRevenueNumericInput('123,45')).toBe(true);
    expect(isRevenueNumericInput('0,')).toBe(true);
    expect(isRevenueNumericInput('123,')).toBe(true);
  });

  it('should accept partial decimal input', () => {
    expect(isRevenueNumericInput('.5')).toBe(true);
    expect(isRevenueNumericInput(',5')).toBe(true);
    expect(isRevenueNumericInput('.')).toBe(true);
    expect(isRevenueNumericInput(',')).toBe(true);
  });

  it('should reject negative numbers', () => {
    expect(isRevenueNumericInput('-1')).toBe(false);
    expect(isRevenueNumericInput('-123.45')).toBe(false);
  });

  it('should reject letters and special characters', () => {
    expect(isRevenueNumericInput('abc')).toBe(false);
    expect(isRevenueNumericInput('12a')).toBe(false);
    expect(isRevenueNumericInput('$100')).toBe(false);
    expect(isRevenueNumericInput('100€')).toBe(false);
  });

  it('should reject multiple decimal separators', () => {
    expect(isRevenueNumericInput('1.2.3')).toBe(false);
    expect(isRevenueNumericInput('1,2,3')).toBe(false);
    expect(isRevenueNumericInput('1.2,3')).toBe(false);
  });
});

describe('normalizeDecimalInput', () => {
  it('should replace comma with dot', () => {
    expect(normalizeDecimalInput('123,45')).toBe('123.45');
    expect(normalizeDecimalInput('0,5')).toBe('0.5');
  });

  it('should not change values with dots', () => {
    expect(normalizeDecimalInput('123.45')).toBe('123.45');
    expect(normalizeDecimalInput('0.5')).toBe('0.5');
  });

  it('should handle values without decimals', () => {
    expect(normalizeDecimalInput('123')).toBe('123');
    expect(normalizeDecimalInput('')).toBe('');
  });

  it('should only replace first comma', () => {
    expect(normalizeDecimalInput('1,2,3')).toBe('1.2,3');
  });
});
