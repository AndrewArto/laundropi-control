import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRevenue } from '../useRevenue';
import { ApiService } from '../../services/api';

// Mock ApiService
vi.mock('../../services/api', () => ({
  ApiService: {
    saveRevenueEntry: vi.fn(),
    getRevenueSummary: vi.fn(),
  },
}));

describe('useRevenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useRevenue());

      expect(result.current.revenueEntries).toEqual({});
      expect(result.current.revenueDrafts).toEqual({});
      expect(result.current.revenueAudit).toEqual({});
      expect(result.current.revenueSummary).toBe(null);
      expect(result.current.revenueLoading).toBe(false);
      expect(result.current.revenueError).toBe(null);
      expect(result.current.revenueSaving).toEqual({});
      expect(result.current.revenueSaveErrors).toEqual({});
      expect(result.current.revenueView).toBe('daily');
      expect(result.current.revenueEntryDates).toEqual([]);
      expect(result.current.revenueAllEntries).toEqual([]);
      expect(result.current.revenueAllLoading).toBe(false);
      expect(result.current.revenueAllError).toBe(null);
      expect(result.current.isRevenueCalendarOpen).toBe(false);
    });

    it('should initialize with current date', () => {
      const { result } = renderHook(() => useRevenue());
      const today = new Date();
      const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(result.current.revenueDate).toBe(expectedDate);
    });
  });

  describe('updateRevenueDraft', () => {
    it('should update draft for an agent', () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100.00',
        }));
      });

      expect(result.current.revenueDrafts['agent1'].coinsTotal).toBe('100.00');
    });

    it('should clear save errors when updating draft', () => {
      const { result } = renderHook(() => useRevenue());

      // Set initial save error
      act(() => {
        result.current.setRevenueSaveErrors({ agent1: 'Some error' });
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Some error');

      // Update draft should clear the error
      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100.00',
        }));
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe(null);
    });
  });

  describe('addRevenueDeduction', () => {
    it('should add a new deduction to the draft', () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.addRevenueDeduction('agent1');
      });

      expect(result.current.revenueDrafts['agent1'].deductions.length).toBe(1);
      expect(result.current.revenueDrafts['agent1'].deductions[0].amount).toBe('');
      expect(result.current.revenueDrafts['agent1'].deductions[0].comment).toBe('');
    });

    it('should add multiple deductions', () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.addRevenueDeduction('agent1');
        result.current.addRevenueDeduction('agent1');
        result.current.addRevenueDeduction('agent1');
      });

      expect(result.current.revenueDrafts['agent1'].deductions.length).toBe(3);
    });
  });

  describe('removeRevenueDeduction', () => {
    it('should remove a deduction by id', () => {
      const { result } = renderHook(() => useRevenue());

      // Add deductions
      act(() => {
        result.current.addRevenueDeduction('agent1');
        result.current.addRevenueDeduction('agent1');
      });

      const deductionId = result.current.revenueDrafts['agent1'].deductions[0].id;

      act(() => {
        result.current.removeRevenueDeduction('agent1', deductionId);
      });

      expect(result.current.revenueDrafts['agent1'].deductions.length).toBe(1);
      expect(result.current.revenueDrafts['agent1'].deductions[0].id).not.toBe(deductionId);
    });
  });

  describe('handleRevenueSave', () => {
    it('should set error for invalid coins total', async () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: 'invalid',
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Coins total must be a non-negative number.');
      expect(ApiService.saveRevenueEntry).not.toHaveBeenCalled();
    });

    it('should set error for negative coins total', async () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '-100',
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Coins total must be a non-negative number.');
    });

    it('should set error for invalid euro coin count', async () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5.5', // Not an integer
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Coin count must be a non-negative integer.');
    });

    it('should set error for invalid bills total', async () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5',
          billsTotal: 'invalid',
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Bills total must be a non-negative number.');
    });

    it('should set error for deduction without comment', async () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5',
          billsTotal: '50',
          deductions: [{ id: '1', amount: '10', comment: '' }],
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Deduction comment is required.');
    });

    it('should set error for deduction with invalid amount', async () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5',
          billsTotal: '50',
          deductions: [{ id: '1', amount: 'invalid', comment: 'Test' }],
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(result.current.revenueSaveErrors['agent1']).toBe('Deduction amount must be a non-negative number.');
    });

    it('should save successfully with valid data', async () => {
      const mockEntry = {
        agentId: 'agent1',
        entryDate: '2024-01-15',
        coinsTotal: 100,
        euroCoinsCount: 5,
        billsTotal: 50,
        deductions: [],
      };
      const mockSummary = { date: '2024-01-15', week: {}, month: {} };

      vi.mocked(ApiService.saveRevenueEntry).mockResolvedValueOnce({ entry: mockEntry, audit: [] });
      vi.mocked(ApiService.getRevenueSummary).mockResolvedValueOnce(mockSummary);

      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5',
          billsTotal: '50',
        }));
      });

      await act(async () => {
        await result.current.handleRevenueSave('agent1');
      });

      expect(ApiService.saveRevenueEntry).toHaveBeenCalledWith('agent1', {
        entryDate: result.current.revenueDate,
        coinsTotal: 100,
        euroCoinsCount: 5,
        billsTotal: 50,
        deductions: [],
      });
      expect(result.current.revenueEntries['agent1']).toEqual(mockEntry);
      expect(result.current.revenueSaveErrors['agent1']).toBe(null);
    });

    it('should set saving state during save', async () => {
      const mockEntry = {
        agentId: 'agent1',
        entryDate: '2024-01-15',
        coinsTotal: 100,
        euroCoinsCount: 5,
        billsTotal: 50,
        deductions: [],
      };

      let resolvePromise: (value: any) => void;
      const savePromise = new Promise(resolve => { resolvePromise = resolve; });
      vi.mocked(ApiService.saveRevenueEntry).mockReturnValueOnce(savePromise as any);
      vi.mocked(ApiService.getRevenueSummary).mockResolvedValueOnce({ date: '2024-01-15', week: {}, month: {} });

      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5',
          billsTotal: '50',
        }));
      });

      let saveFinished = false;
      act(() => {
        result.current.handleRevenueSave('agent1').then(() => { saveFinished = true; });
      });

      // Should be saving
      expect(result.current.revenueSaving['agent1']).toBe(true);

      await act(async () => {
        resolvePromise!({ entry: mockEntry, audit: [] });
        await Promise.resolve();
      });
    });

    it('should handle save failure', async () => {
      vi.mocked(ApiService.saveRevenueEntry).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.updateRevenueDraft('agent1', draft => ({
          ...draft,
          coinsTotal: '100',
          euroCoinsCount: '5',
          billsTotal: '50',
        }));
      });

      await act(async () => {
        try {
          await result.current.handleRevenueSave('agent1');
        } catch {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.revenueSaveErrors['agent1']).toBe('Failed to save revenue entry.');
      });
      expect(result.current.revenueSaving['agent1']).toBe(false);
    });
  });

  describe('getLatestAudit', () => {
    it('should return null when no audit exists', () => {
      const { result } = renderHook(() => useRevenue());
      expect(result.current.getLatestAudit('agent1', 'coinsTotal')).toBe(null);
    });

    it('should return matching audit entry', () => {
      const { result } = renderHook(() => useRevenue());

      const auditEntry = {
        field: 'coinsTotal',
        oldValue: '50.00',
        newValue: '100.00',
        changedAt: Date.now(),
        changedBy: 'admin',
      };

      act(() => {
        result.current.setRevenueAudit({ agent1: [auditEntry] });
      });

      expect(result.current.getLatestAudit('agent1', 'coinsTotal')).toEqual(auditEntry);
    });

    it('should return null for entry with null oldValue', () => {
      const { result } = renderHook(() => useRevenue());

      const auditEntry = {
        field: 'coinsTotal',
        oldValue: null,
        newValue: '100.00',
        changedAt: Date.now(),
        changedBy: 'admin',
      };

      act(() => {
        result.current.setRevenueAudit({ agent1: [auditEntry] });
      });

      expect(result.current.getLatestAudit('agent1', 'coinsTotal')).toBe(null);
    });
  });

  describe('getDeductionSummary', () => {
    it('should return null for null input', () => {
      const { result } = renderHook(() => useRevenue());
      expect(result.current.getDeductionSummary(null)).toBe(null);
    });

    it('should return null for invalid JSON', () => {
      const { result } = renderHook(() => useRevenue());
      expect(result.current.getDeductionSummary('invalid json')).toBe(null);
    });

    it('should return null for non-array JSON', () => {
      const { result } = renderHook(() => useRevenue());
      expect(result.current.getDeductionSummary('{"amount": 100}')).toBe(null);
    });

    it('should sum deduction amounts', () => {
      const { result } = renderHook(() => useRevenue());
      const deductions = JSON.stringify([
        { amount: 10, comment: 'Test 1' },
        { amount: 20.5, comment: 'Test 2' },
        { amount: 5, comment: 'Test 3' },
      ]);
      expect(result.current.getDeductionSummary(deductions)).toBe('35.50');
    });

    it('should handle empty array', () => {
      const { result } = renderHook(() => useRevenue());
      expect(result.current.getDeductionSummary('[]')).toBe('0.00');
    });
  });

  describe('resetRevenueState', () => {
    it('should reset all state to initial values', () => {
      const { result } = renderHook(() => useRevenue());

      // Set some state
      act(() => {
        result.current.setRevenueEntries({ agent1: null });
        result.current.setRevenueDrafts({ agent1: { coinsTotal: '100', euroCoinsCount: '5', billsTotal: '50', deductions: [] } });
        result.current.setRevenueLoading(true);
        result.current.setRevenueError('Some error');
        result.current.setRevenueView('all');
        result.current.setIsRevenueCalendarOpen(true);
      });

      // Reset
      act(() => {
        result.current.resetRevenueState();
      });

      expect(result.current.revenueEntries).toEqual({});
      expect(result.current.revenueDrafts).toEqual({});
      expect(result.current.revenueAudit).toEqual({});
      expect(result.current.revenueSummary).toBe(null);
      expect(result.current.revenueLoading).toBe(false);
      expect(result.current.revenueError).toBe(null);
      expect(result.current.revenueSaving).toEqual({});
      expect(result.current.revenueSaveErrors).toEqual({});
      expect(result.current.revenueView).toBe('daily');
      expect(result.current.revenueEntryDates).toEqual([]);
      expect(result.current.revenueAllEntries).toEqual([]);
      expect(result.current.revenueAllLoading).toBe(false);
      expect(result.current.revenueAllError).toBe(null);
      expect(result.current.isRevenueCalendarOpen).toBe(false);
    });
  });

  describe('setters', () => {
    it('should update revenueDate', () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.setRevenueDate('2024-06-15');
      });

      expect(result.current.revenueDate).toBe('2024-06-15');
    });

    it('should update revenueView', () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.setRevenueView('all');
      });

      expect(result.current.revenueView).toBe('all');

      act(() => {
        result.current.setRevenueView('bankImport');
      });

      expect(result.current.revenueView).toBe('bankImport');
    });

    it('should update isRevenueCalendarOpen', () => {
      const { result } = renderHook(() => useRevenue());

      act(() => {
        result.current.setIsRevenueCalendarOpen(true);
      });

      expect(result.current.isRevenueCalendarOpen).toBe(true);
    });
  });
});
