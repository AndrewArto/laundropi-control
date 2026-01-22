import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevenueView } from '../views/RevenueView';

describe('RevenueView', () => {
  const mockUser = {
    username: 'admin',
    role: 'admin' as const,
    lastLoginAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockLaundry = {
    id: 'test-agent',
    name: 'Test Laundry',
    relays: [],
    isOnline: true,
    isMock: false,
    lastHeartbeat: Date.now(),
  };

  const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

  const mockProps = {
    authUser: mockUser,
    laundries: [mockLaundry],
    revenueView: 'daily' as const,
    setRevenueView: vi.fn(),
    revenueDate: '2026-01-21',
    setRevenueDate: vi.fn(),
    isRevenueCalendarOpen: false,
    setIsRevenueCalendarOpen: vi.fn(),
    revenueEntryDates: [],
    revenueEntries: {},
    revenueLoading: false,
    revenueError: null,
    revenueSummary: null,
    revenueSaveErrors: {},
    revenueSaving: {},
    revenueDrafts: {},
    revenueAudit: {},
    revenueAllEntries: [],
    revenueAllLoading: false,
    revenueAllError: null,
    DAYS_OF_WEEK,
    getMonthRange: vi.fn(() => ({ year: 2026, month: 1, daysInMonth: 31 })),
    shiftDateByDays: vi.fn((date, days) => date),
    shiftDateByMonths: vi.fn((date, months) => date),
    formatMoney: vi.fn((val) => `€${val.toFixed(2)}`),
    formatTimestamp: vi.fn((ts) => new Date(ts).toLocaleString()),
    buildRevenueDraft: vi.fn(() => ({
      coinsTotal: '',
      euroCoinsCount: '',
      billsTotal: '',
      deductions: [],
    })),
    updateRevenueDraftFromHook: vi.fn(),
    isRevenueNumericInput: vi.fn(() => true),
    getLatestAudit: vi.fn(() => undefined),
    getDeductionSummary: vi.fn(() => null),
    addRevenueDeductionFromHook: vi.fn(),
    removeRevenueDeductionFromHook: vi.fn(),
    handleRevenueSaveFromHook: vi.fn(),
    handleExportRevenueCsv: vi.fn(),
  };

  it('should render revenue header for admin', () => {
    render(<RevenueView {...mockProps} />);
    expect(screen.getByText('Revenue')).toBeTruthy();
  });

  it('should show admin-only message for non-admin users', () => {
    const nonAdminProps = {
      ...mockProps,
      authUser: { ...mockUser, role: 'user' as const },
    };
    render(<RevenueView {...nonAdminProps} />);
    expect(screen.getByText(/admin users only/i)).toBeTruthy();
  });

  it('should render daily/all view toggle buttons', () => {
    render(<RevenueView {...mockProps} />);
    expect(screen.getByText('Daily')).toBeTruthy();
    expect(screen.getByText('All entries')).toBeTruthy();
  });

  it('should render without crashing when no data', () => {
    const emptyProps = {
      ...mockProps,
      laundries: [],
    };
    render(<RevenueView {...emptyProps} />);
    expect(screen.getByText('Revenue')).toBeTruthy();
  });
});
