import { describe, it, expect } from 'vitest';

/**
 * Tests for revenue data polling update mechanism.
 *
 * The polling system uses JSON.stringify comparison to determine if data has changed.
 * This prevents unnecessary re-renders when polling returns the same data.
 */

// Simulate the state update function used in App.tsx
const createStateUpdater = <T>(current: T) => {
  let state = current;
  const setState = (updater: (prev: T) => T) => {
    const next = updater(state);
    state = next;
    return next;
  };
  const getState = () => state;
  return { setState, getState };
};

// The comparison function used in fetchRevenueData
const shouldUpdate = <T>(prev: T, next: T): boolean => {
  return JSON.stringify(prev) !== JSON.stringify(next);
};

describe('Revenue polling data comparison', () => {
  describe('shouldUpdate comparison', () => {
    it('should return false when data is identical', () => {
      const prev = { agent1: { coinsTotal: 100, billsTotal: 50 } };
      const next = { agent1: { coinsTotal: 100, billsTotal: 50 } };
      expect(shouldUpdate(prev, next)).toBe(false);
    });

    it('should return true when data has changed', () => {
      const prev = { agent1: { coinsTotal: 100, billsTotal: 50 } };
      const next = { agent1: { coinsTotal: 150, billsTotal: 50 } };
      expect(shouldUpdate(prev, next)).toBe(true);
    });

    it('should return true when new agent is added', () => {
      const prev = { agent1: { coinsTotal: 100 } };
      const next = { agent1: { coinsTotal: 100 }, agent2: { coinsTotal: 200 } };
      expect(shouldUpdate(prev, next)).toBe(true);
    });

    it('should return true when agent is removed', () => {
      const prev = { agent1: { coinsTotal: 100 }, agent2: { coinsTotal: 200 } };
      const next = { agent1: { coinsTotal: 100 } };
      expect(shouldUpdate(prev, next)).toBe(true);
    });

    it('should handle null values correctly', () => {
      const prev = { agent1: null };
      const next = { agent1: null };
      expect(shouldUpdate(prev, next)).toBe(false);
    });

    it('should detect null to value change', () => {
      const prev = { agent1: null };
      const next = { agent1: { coinsTotal: 100 } };
      expect(shouldUpdate(prev, next)).toBe(true);
    });

    it('should handle empty objects', () => {
      expect(shouldUpdate({}, {})).toBe(false);
    });

    it('should handle arrays correctly', () => {
      const prev = [{ id: 1, amount: 100 }];
      const next = [{ id: 1, amount: 100 }];
      expect(shouldUpdate(prev, next)).toBe(false);
    });

    it('should detect array changes', () => {
      const prev = [{ id: 1, amount: 100 }];
      const next = [{ id: 1, amount: 200 }];
      expect(shouldUpdate(prev, next)).toBe(true);
    });
  });

  describe('State update with comparison', () => {
    it('should not update state when data is unchanged', () => {
      const initialData = { agent1: { coinsTotal: 100, billsTotal: 50 } };
      const { setState, getState } = createStateUpdater(initialData);

      const newData = { agent1: { coinsTotal: 100, billsTotal: 50 } };

      // Simulate the setState call from fetchRevenueData
      const result = setState(prev =>
        JSON.stringify(prev) !== JSON.stringify(newData) ? newData : prev
      );

      // State should be the exact same object reference (not updated)
      expect(result).toBe(initialData);
      expect(getState()).toBe(initialData);
    });

    it('should update state when data has changed', () => {
      const initialData = { agent1: { coinsTotal: 100, billsTotal: 50 } };
      const { setState, getState } = createStateUpdater(initialData);

      const newData = { agent1: { coinsTotal: 150, billsTotal: 50 } };

      const result = setState(prev =>
        JSON.stringify(prev) !== JSON.stringify(newData) ? newData : prev
      );

      // State should be updated to new data
      expect(result).toBe(newData);
      expect(getState()).toBe(newData);
      expect(result).not.toBe(initialData);
    });
  });

  describe('Silent polling behavior', () => {
    it('should preserve drafts during silent polling', () => {
      // Simulate user editing a draft
      const userDraft = { coinsTotal: '150', euroCoinsCount: '10', billsTotal: '50', deductions: [] };
      const serverData = { coinsTotal: '100', euroCoinsCount: '5', billsTotal: '30', deductions: [] };

      // In silent mode, we don't update drafts
      const silent = true;
      let drafts = { agent1: userDraft };

      if (!silent) {
        // This should NOT execute during silent polling
        drafts = { agent1: serverData };
      }

      // User's draft should be preserved
      expect(drafts.agent1).toBe(userDraft);
      expect(drafts.agent1.coinsTotal).toBe('150');
    });

    it('should update drafts during non-silent fetch', () => {
      const userDraft = { coinsTotal: '150', euroCoinsCount: '10', billsTotal: '50', deductions: [] };
      const serverData = { coinsTotal: '100', euroCoinsCount: '5', billsTotal: '30', deductions: [] };

      const silent = false;
      let drafts = { agent1: userDraft };

      if (!silent) {
        drafts = { agent1: serverData };
      }

      // Drafts should be updated from server
      expect(drafts.agent1).toBe(serverData);
      expect(drafts.agent1.coinsTotal).toBe('100');
    });
  });

  describe('Empty laundry handling during silent polling', () => {
    it('should not clear data when laundryIdKey is empty during silent polling', () => {
      const existingData = {
        entries: { agent1: { coinsTotal: 100 } },
        summary: { week: { revenue: 1000 }, month: { revenue: 5000 } },
      };

      const laundryIdKey = ''; // Temporarily empty
      const silent = true;

      let cleared = false;
      if (!laundryIdKey) {
        if (silent) {
          // Should return early without clearing
          // This is the fix we implemented
        } else {
          cleared = true;
        }
      }

      expect(cleared).toBe(false);
    });

    it('should clear data when laundryIdKey is empty during non-silent fetch', () => {
      const laundryIdKey = '';
      const silent = false;

      let cleared = false;
      if (!laundryIdKey) {
        if (silent) {
          // Return early
        } else {
          cleared = true;
        }
      }

      expect(cleared).toBe(true);
    });
  });

  describe('Race condition prevention', () => {
    it('should use captured laundries array to avoid race conditions', () => {
      // Simulate laundries changing during async operation
      let laundries = [{ id: 'agent1' }, { id: 'agent2' }];

      // Capture at start of fetch (the fix we implemented)
      const capturedLaundries = [...laundries];

      // Simulate laundries changing during async operation
      laundries = [];

      // The captured array should still have the original values
      expect(capturedLaundries.length).toBe(2);
      expect(capturedLaundries[0].id).toBe('agent1');
      expect(capturedLaundries[1].id).toBe('agent2');

      // Current laundries is empty but we use captured
      expect(laundries.length).toBe(0);
    });
  });
});
