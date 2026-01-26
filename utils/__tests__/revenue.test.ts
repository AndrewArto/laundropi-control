import { describe, it, expect } from 'vitest';
import { formatMoney, normalizeDecimalInput } from '../formatting';
import { buildRevenueDraft, parseMoneyInput, getEntryRevenue, getEntryProfitLoss } from '../revenue';
import type { RevenueEntry } from '../../types';

describe('formatMoney', () => {
  it('should format integers without division', () => {
    expect(formatMoney(100)).toBe('100.00');
    expect(formatMoney(50)).toBe('50.00');
    expect(formatMoney(1)).toBe('1.00');
  });

  it('should format decimals correctly', () => {
    expect(formatMoney(123.45)).toBe('123.45');
    expect(formatMoney(10.5)).toBe('10.50');
    expect(formatMoney(0.99)).toBe('0.99');
  });

  it('should handle zero', () => {
    expect(formatMoney(0)).toBe('0.00');
  });

  it('should handle null/undefined', () => {
    expect(formatMoney(null)).toBe('0.00');
    expect(formatMoney(undefined)).toBe('0.00');
  });

  it('should NOT divide by 100 (regression test for mobile input bug)', () => {
    // User enters 150 euros - should display as 150.00, not 1.50
    expect(formatMoney(150)).toBe('150.00');
    // User enters 1234.56 euros - should display as 1234.56, not 12.35
    expect(formatMoney(1234.56)).toBe('1234.56');
  });
});

describe('parseMoneyInput', () => {
  it('should parse decimal input correctly', () => {
    expect(parseMoneyInput('100')).toBe(100);
    expect(parseMoneyInput('100.50')).toBe(100.5);
    expect(parseMoneyInput('100,50')).toBe(100.5);
  });

  it('should return 0 for empty input', () => {
    expect(parseMoneyInput('')).toBe(0);
    expect(parseMoneyInput('  ')).toBe(0);
  });

  it('should return null for invalid input', () => {
    expect(parseMoneyInput('abc')).toBe(null);
    expect(parseMoneyInput('-50')).toBe(null);
  });

  it('should NOT multiply by 100 (values are in euros, not cents)', () => {
    // User enters "150" in the input - should be stored as 150, not 15000
    expect(parseMoneyInput('150')).toBe(150);
    expect(parseMoneyInput('150.00')).toBe(150);
  });
});

describe('buildRevenueDraft', () => {
  it('should build draft from entry without dividing values by 100', () => {
    const entry: RevenueEntry = {
      id: '1',
      agentId: 'test-agent',
      entryDate: '2024-01-15',
      coinsTotal: 150,
      euroCoinsCount: 50,
      billsTotal: 200,
      deductions: [{ amount: 25.5, comment: 'Test deduction' }],
      deductionsTotal: 25.5,
      hasEdits: false,
      createdBy: 'user1',
      updatedBy: 'user1',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:00:00Z',
    };

    const draft = buildRevenueDraft(entry);

    // Values should be formatted as-is (euros), not divided by 100
    expect(draft.coinsTotal).toBe('150.00');
    expect(draft.billsTotal).toBe('200.00');
    expect(draft.euroCoinsCount).toBe('50');
    expect(draft.deductions[0].amount).toBe('25.50');
  });

  it('should return empty strings for null entry', () => {
    const draft = buildRevenueDraft(null);
    expect(draft.coinsTotal).toBe('');
    expect(draft.billsTotal).toBe('');
    expect(draft.euroCoinsCount).toBe('');
    expect(draft.deductions).toEqual([]);
  });
});

describe('normalizeDecimalInput', () => {
  it('should convert comma to period', () => {
    expect(normalizeDecimalInput('100,50')).toBe('100.50');
    expect(normalizeDecimalInput('1,5')).toBe('1.5');
  });

  it('should leave period unchanged', () => {
    expect(normalizeDecimalInput('100.50')).toBe('100.50');
  });
});

describe('getEntryRevenue', () => {
  it('should use only coinsTotal as revenue (not billsTotal)', () => {
    // This test ensures chart data matches summary calculation
    // coinsTotal is the main revenue field (includes cash + Stripe)
    // billsTotal is legacy and should NOT be added
    const entry: RevenueEntry = {
      agentId: 'test-agent',
      entryDate: '2026-01-15',
      coinsTotal: 150,
      euroCoinsCount: 50,
      billsTotal: 200, // This should be IGNORED
      deductions: [],
      deductionsTotal: 0,
      hasEdits: false,
      createdBy: 'user1',
      updatedBy: 'user1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Revenue should be ONLY coinsTotal, NOT coinsTotal + billsTotal
    expect(getEntryRevenue(entry)).toBe(150);
    expect(getEntryRevenue(entry)).not.toBe(350); // Would be wrong if billsTotal was added
  });

  it('should handle zero coinsTotal', () => {
    const entry = { coinsTotal: 0, billsTotal: 100 };
    expect(getEntryRevenue(entry)).toBe(0);
  });

  it('should handle undefined coinsTotal', () => {
    const entry = { billsTotal: 100 };
    expect(getEntryRevenue(entry)).toBe(0);
  });
});

describe('getEntryProfitLoss', () => {
  it('should calculate profit/loss as revenue minus deductions', () => {
    const entry: RevenueEntry = {
      agentId: 'test-agent',
      entryDate: '2026-01-15',
      coinsTotal: 150,
      euroCoinsCount: 50,
      billsTotal: 200, // Should be ignored
      deductions: [{ amount: 30, comment: 'Test' }],
      deductionsTotal: 30,
      hasEdits: false,
      createdBy: 'user1',
      updatedBy: 'user1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // P/L = coinsTotal - deductionsTotal = 150 - 30 = 120
    expect(getEntryProfitLoss(entry)).toBe(120);
  });

  it('should handle negative profit (loss)', () => {
    const entry: RevenueEntry = {
      agentId: 'test-agent',
      entryDate: '2026-01-15',
      coinsTotal: 50,
      euroCoinsCount: 10,
      billsTotal: 0,
      deductions: [{ amount: 100, comment: 'Big expense' }],
      deductionsTotal: 100,
      hasEdits: false,
      createdBy: 'user1',
      updatedBy: 'user1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // P/L = 50 - 100 = -50 (loss)
    expect(getEntryProfitLoss(entry)).toBe(-50);
  });
});
