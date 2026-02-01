import { describe, it, expect } from 'vitest';
import { formatMoney, normalizeDecimalInput } from '../formatting';
import { buildRevenueDraft, parseMoneyInput, getEntryRevenue, getEntryProfitLoss, filterRevenueEntries, sortRevenueEntries } from '../revenue';
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

// --- Sort & Filter tests ---

const makeEntry = (overrides: Partial<RevenueEntry>): RevenueEntry => ({
  agentId: 'agent-1',
  entryDate: '2026-01-15',
  createdAt: 1000,
  updatedAt: 2000,
  coinsTotal: 100,
  euroCoinsCount: 50,
  billsTotal: 30,
  deductions: [],
  deductionsTotal: 0,
  createdBy: 'admin',
  updatedBy: 'admin',
  hasEdits: false,
  ...overrides,
});

const testEntries: RevenueEntry[] = [
  makeEntry({ agentId: 'agent-1', entryDate: '2026-01-15', coinsTotal: 200, euroCoinsCount: 100, billsTotal: 50, deductionsTotal: 10, updatedBy: 'admin', updatedAt: 2000 }),
  makeEntry({ agentId: 'agent-2', entryDate: '2026-01-16', coinsTotal: 500, euroCoinsCount: 250, billsTotal: 100, deductionsTotal: 25, updatedBy: 'viewer1', updatedAt: 3000 }),
  makeEntry({ agentId: 'agent-1', entryDate: '2026-01-17', coinsTotal: 150, euroCoinsCount: 75, billsTotal: 30, deductionsTotal: 5, updatedBy: 'admin', updatedAt: 4000 }),
];

describe('filterRevenueEntries', () => {
  it('should return all entries when no filters', () => {
    expect(filterRevenueEntries(testEntries, {})).toHaveLength(3);
  });

  it('should filter by agentId', () => {
    const result = filterRevenueEntries(testEntries, { agentId: 'agent-2' });
    expect(result).toHaveLength(1);
    expect(result[0].entryDate).toBe('2026-01-16');
  });

  it('should filter by date substring', () => {
    const result = filterRevenueEntries(testEntries, { entryDate: '01-15' });
    expect(result).toHaveLength(1);
    expect(result[0].entryDate).toBe('2026-01-15');
  });

  it('should filter by minimum coinsTotal', () => {
    const result = filterRevenueEntries(testEntries, { coinsTotal: '200' });
    expect(result).toHaveLength(2); // 200 and 500
  });

  it('should filter by minimum euroCoinsCount', () => {
    const result = filterRevenueEntries(testEntries, { euroCoinsCount: '100' });
    expect(result).toHaveLength(2); // 100 and 250
  });

  it('should filter by minimum billsTotal', () => {
    const result = filterRevenueEntries(testEntries, { billsTotal: '50' });
    expect(result).toHaveLength(2); // 50 and 100
  });

  it('should filter by minimum deductionsTotal', () => {
    const result = filterRevenueEntries(testEntries, { deductionsTotal: '10' });
    expect(result).toHaveLength(2); // 10 and 25
  });

  it('should filter by updatedBy (case-insensitive substring)', () => {
    const result = filterRevenueEntries(testEntries, { updatedBy: 'viewer' });
    expect(result).toHaveLength(1);
    expect(result[0].updatedBy).toBe('viewer1');
  });

  it('should combine multiple filters', () => {
    const result = filterRevenueEntries(testEntries, { agentId: 'agent-1', coinsTotal: '200' });
    expect(result).toHaveLength(1);
    expect(result[0].entryDate).toBe('2026-01-15');
  });

  it('should return empty when no entries match', () => {
    const result = filterRevenueEntries(testEntries, { entryDate: 'nonexistent' });
    expect(result).toHaveLength(0);
  });
});

describe('sortRevenueEntries', () => {
  it('should sort by entryDate ascending', () => {
    const result = sortRevenueEntries(testEntries, { col: 'entryDate', dir: 'asc' });
    expect(result.map(e => e.entryDate)).toEqual(['2026-01-15', '2026-01-16', '2026-01-17']);
  });

  it('should sort by entryDate descending', () => {
    const result = sortRevenueEntries(testEntries, { col: 'entryDate', dir: 'desc' });
    expect(result.map(e => e.entryDate)).toEqual(['2026-01-17', '2026-01-16', '2026-01-15']);
  });

  it('should sort by coinsTotal ascending', () => {
    const result = sortRevenueEntries(testEntries, { col: 'coinsTotal', dir: 'asc' });
    expect(result.map(e => e.coinsTotal)).toEqual([150, 200, 500]);
  });

  it('should sort by coinsTotal descending', () => {
    const result = sortRevenueEntries(testEntries, { col: 'coinsTotal', dir: 'desc' });
    expect(result.map(e => e.coinsTotal)).toEqual([500, 200, 150]);
  });

  it('should sort by updatedAt (numeric) descending', () => {
    const result = sortRevenueEntries(testEntries, { col: 'updatedAt', dir: 'desc' });
    expect(result.map(e => e.updatedAt)).toEqual([4000, 3000, 2000]);
  });

  it('should sort by agentId (string) ascending', () => {
    const result = sortRevenueEntries(testEntries, { col: 'agentId', dir: 'asc' });
    expect(result[0].agentId).toBe('agent-1');
    expect(result[2].agentId).toBe('agent-2');
  });

  it('should not mutate the original array', () => {
    const original = [...testEntries];
    sortRevenueEntries(testEntries, { col: 'coinsTotal', dir: 'asc' });
    expect(testEntries.map(e => e.coinsTotal)).toEqual(original.map(e => e.coinsTotal));
  });
});
