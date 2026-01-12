import { describe, it, expect } from 'vitest';
import { __revenueHelpers } from '../../App';

const { isRevenueNumericInput } = __revenueHelpers;

describe('revenue numeric input', () => {
  it('accepts digits and decimal separators', () => {
    expect(isRevenueNumericInput('')).toBe(true);
    expect(isRevenueNumericInput('0')).toBe(true);
    expect(isRevenueNumericInput('123')).toBe(true);
    expect(isRevenueNumericInput('12.3')).toBe(true);
    expect(isRevenueNumericInput('.5')).toBe(true);
    expect(isRevenueNumericInput('0.')).toBe(true);
    expect(isRevenueNumericInput('12,3')).toBe(true);
    expect(isRevenueNumericInput(',5')).toBe(true);
    expect(isRevenueNumericInput('0,')).toBe(true);
  });

  it('rejects other characters', () => {
    expect(isRevenueNumericInput('1,2.3')).toBe(false);
    expect(isRevenueNumericInput('1..2')).toBe(false);
    expect(isRevenueNumericInput('1,,2')).toBe(false);
    expect(isRevenueNumericInput('1e3')).toBe(false);
    expect(isRevenueNumericInput('1-2')).toBe(false);
    expect(isRevenueNumericInput('1.2.3')).toBe(false);
    expect(isRevenueNumericInput('abc')).toBe(false);
  });
});
