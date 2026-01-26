import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevenueView } from '../views/RevenueView';
import { GENERAL_AGENT_ID } from '../../types';

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

  const mockLaundry2 = {
    id: 'test-agent-2',
    name: 'Test Laundry 2',
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
    revenueEntryDateInfo: [],
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
    shiftDateByDays: vi.fn((date, _days) => date),
    shiftDateByMonths: vi.fn((date, _months) => date),
    formatMoney: vi.fn((val) => val.toFixed(2)),
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
    // Bank Import props
    bankImports: [],
    bankActiveImport: null,
    bankTransactions: [],
    bankSummary: null,
    bankLoading: false,
    bankUploading: false,
    bankApplying: false,
    bankError: null,
    bankPendingChanges: new Map(),
    bankHasUnsavedChanges: false,
    onBankUploadCsv: vi.fn(async () => ({ success: true })),
    onBankLoadImport: vi.fn(async () => {}),
    onBankAssignTransaction: vi.fn(),
    onBankAssignStripeCredit: vi.fn(),
    onBankIgnoreTransaction: vi.fn(),
    onBankUnignoreTransaction: vi.fn(),
    onBankUndoChange: vi.fn(),
    onBankApplyChanges: vi.fn(async () => true),
    onBankCompleteImport: vi.fn(async () => {}),
    onBankCancelImport: vi.fn(async () => {}),
    onBankDeleteImport: vi.fn(async () => {}),
    onBankClearActiveImport: vi.fn(),
  };

  it('should render finance header for admin', () => {
    render(<RevenueView {...mockProps} />);
    expect(screen.getByText('Finance')).toBeTruthy();
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

  it('should render Bank Import tab', () => {
    render(<RevenueView {...mockProps} />);
    expect(screen.getByText('Bank Import')).toBeTruthy();
  });

  it('should render without crashing when no laundries', () => {
    const emptyProps = {
      ...mockProps,
      laundries: [],
    };
    render(<RevenueView {...emptyProps} />);
    expect(screen.getByText('Finance')).toBeTruthy();
  });

  describe('Fix Cost Center', () => {
    it('should always render Fix cost center box', () => {
      render(<RevenueView {...mockProps} />);
      expect(screen.getByText('Fix cost')).toBeTruthy();
    });

    it('should show Add cost and Save costs buttons when expanded', () => {
      render(<RevenueView {...mockProps} />);
      // Expand Fix cost section first
      const fixCostHeader = screen.getByText('Fix cost').closest('button');
      fireEvent.click(fixCostHeader!);
      expect(screen.getByText('Add cost')).toBeTruthy();
      expect(screen.getByText('Save costs')).toBeTruthy();
    });

    it('should call addRevenueDeductionFromHook when Add cost clicked', () => {
      render(<RevenueView {...mockProps} />);
      // Expand Fix cost section first
      const fixCostHeader = screen.getByText('Fix cost').closest('button');
      fireEvent.click(fixCostHeader!);
      const addCostButton = screen.getByText('Add cost');
      fireEvent.click(addCostButton);
      expect(mockProps.addRevenueDeductionFromHook).toHaveBeenCalledWith(GENERAL_AGENT_ID);
    });
  });

  describe('Collapsible Sections', () => {
    it('should render laundry sections in collapsed state by default', () => {
      render(<RevenueView {...mockProps} />);
      expect(screen.getByText('Test Laundry')).toBeTruthy();
      // Both laundry and Fix cost sections are collapsed, so 2 "Click to expand" elements
      const clickToExpands = screen.getAllByText('Click to expand');
      expect(clickToExpands.length).toBe(2);
    });

    it('should expand laundry section when header clicked', () => {
      render(<RevenueView {...mockProps} />);
      const laundryHeader = screen.getByText('Test Laundry').closest('button');
      fireEvent.click(laundryHeader!);
      // After expanding laundry, only Fix cost still shows "Click to expand"
      const clickToExpands = screen.getAllByText('Click to expand');
      expect(clickToExpands.length).toBe(1);
    });

    it('should show revenue inputs when expanded', () => {
      render(<RevenueView {...mockProps} />);
      const laundryHeader = screen.getByText('Test Laundry').closest('button');
      fireEvent.click(laundryHeader!);
      expect(screen.getByText('Revenue total (€)')).toBeTruthy();
      expect(screen.getByText('Coins in €1 (count)')).toBeTruthy();
      expect(screen.getByText('Bills total (€)')).toBeTruthy();
    });

    it('should show Save entry button when expanded', () => {
      render(<RevenueView {...mockProps} />);
      const laundryHeader = screen.getByText('Test Laundry').closest('button');
      fireEvent.click(laundryHeader!);
      expect(screen.getByText('Save entry')).toBeTruthy();
    });
  });

  describe('Donut Charts', () => {
    it('should render donut charts for week and month in laundry section', () => {
      const propsWithSummary = {
        ...mockProps,
        revenueSummary: {
          date: '2026-01-21',
          week: {
            startDate: '2026-01-20',
            endDate: '2026-01-26',
            totalsByAgent: { 'test-agent': 1000 },
            overall: 1000,
            profitLossByAgent: { 'test-agent': 800 },
            profitLossOverall: 800,
          },
          month: {
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            totalsByAgent: { 'test-agent': 5000 },
            overall: 5000,
            profitLossByAgent: { 'test-agent': 4000 },
            profitLossOverall: 4000,
          },
        },
      };
      render(<RevenueView {...propsWithSummary} />);
      // Should have multiple "Week" and "Month" labels (in donut charts and summary sections)
      const weekLabels = screen.getAllByText('Week');
      const monthLabels = screen.getAllByText('Month');
      expect(weekLabels.length).toBeGreaterThan(0);
      expect(monthLabels.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Log Labels', () => {
    it('should display friendly labels in audit log', () => {
      const propsWithAudit = {
        ...mockProps,
        revenueAudit: {
          'test-agent': [
            {
              id: 1,
              agentId: 'test-agent',
              entryDate: '2026-01-21',
              field: 'coinsTotal',
              oldValue: '100.00',
              newValue: '150.00',
              user: 'admin',
              createdAt: Date.now(),
            },
          ],
        },
      };
      render(<RevenueView {...propsWithAudit} />);
      // Expand laundry section first to see audit log
      const laundryHeader = screen.getByText('Test Laundry').closest('button');
      fireEvent.click(laundryHeader!);
      // Should show "Revenue total" instead of "coinsTotal"
      expect(screen.getByText(/Revenue total:/)).toBeTruthy();
    });
  });

  describe('Multiple Laundries', () => {
    it('should render multiple laundries plus Fix cost', () => {
      const propsWithMultiple = {
        ...mockProps,
        laundries: [mockLaundry, mockLaundry2],
      };
      render(<RevenueView {...propsWithMultiple} />);
      expect(screen.getByText('Test Laundry')).toBeTruthy();
      expect(screen.getByText('Test Laundry 2')).toBeTruthy();
      expect(screen.getByText('Fix cost')).toBeTruthy();
    });

    it('should allow expanding multiple sections independently', () => {
      const propsWithMultiple = {
        ...mockProps,
        laundries: [mockLaundry, mockLaundry2],
      };
      render(<RevenueView {...propsWithMultiple} />);

      // Expand first laundry
      const firstHeader = screen.getByText('Test Laundry').closest('button');
      fireEvent.click(firstHeader!);

      // First should be expanded, second laundry and Fix cost should still show "Click to expand"
      const clickToExpands = screen.getAllByText('Click to expand');
      expect(clickToExpands.length).toBe(2); // Second laundry + Fix cost both collapsed
    });
  });

  describe('Loading State', () => {
    it('should show loading message when revenue is loading', () => {
      const loadingProps = {
        ...mockProps,
        revenueLoading: true,
      };
      render(<RevenueView {...loadingProps} />);
      expect(screen.getByText('Loading revenue data...')).toBeTruthy();
    });
  });

  describe('Error State', () => {
    it('should show error message when revenue error exists', () => {
      const errorProps = {
        ...mockProps,
        revenueError: 'Failed to load revenue data',
      };
      render(<RevenueView {...errorProps} />);
      expect(screen.getByText('Failed to load revenue data')).toBeTruthy();
    });
  });
});
