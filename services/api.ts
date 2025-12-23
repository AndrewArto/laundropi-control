
import { Relay, Schedule, RelayType, RelayGroup } from '../types';
import { INITIAL_RELAYS, MOCK_SCHEDULES } from '../constants';

const API_BASE = (() => {
  if (typeof window === 'undefined') return '/api';
  // When served from vite preview on :3000, API lives on :3001
  const { hostname, port, protocol } = window.location;
  if (port === '3000') {
    return `${protocol}//${hostname}:3001/api`;
  }
  return '/api';
})();

// --- INTERNAL MOCK SERVER STATE ---
// This allows the app to function fully in the browser preview
// by simulating the backend database in memory. When running in
// the browser and the backend is unreachable, we persist this mock
// state to localStorage so reloads keep visibility/name/icon edits.
const STORAGE_KEY = 'laundropi-mock-state';

const loadMockState = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const persistMockState = (state: typeof mockState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

let mockState = loadMockState() || {
  relays: JSON.parse(JSON.stringify(INITIAL_RELAYS)) as Relay[],
  schedules: JSON.parse(JSON.stringify(MOCK_SCHEDULES)) as Schedule[],
  groups: [] as RelayGroup[],
  isOffline: false
};

let lastGoodState: { relays: Relay[]; schedules: Schedule[]; groups: RelayGroup[]; isMock: boolean } | null = null;

// Helper to simulate network delay for realism
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const ApiService = {
  async getStatus(): Promise<{ relays: Relay[], schedules: Schedule[], groups: RelayGroup[], isMock: boolean }> {
    try {
      // 1. Try Real Server
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
      
      const res = await fetch(`${API_BASE}/status`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const isHardware = Boolean(data.isHardware);
      
      // Sync mock state with real state so if we go offline, we have latest
      mockState.relays = data.relays;
      mockState.schedules = data.schedules;
      mockState.groups = data.groups || [];
      mockState.isOffline = false;
      lastGoodState = { relays: [...data.relays], schedules: [...data.schedules], groups: [...(data.groups || [])], isMock: !isHardware };
      persistMockState(mockState);
      
      return { ...data, isMock: !isHardware };
    } catch (error) {
      // 2. Fallback to last good; if none, bubble error so caller can keep current UI state
      if (lastGoodState) {
        console.warn('[API] Status fetch failed, using last known good state.');
        return { 
          relays: [...lastGoodState.relays],
          schedules: [...lastGoodState.schedules],
          groups: [...lastGoodState.groups],
          isMock: lastGoodState.isMock
        };
      }
      throw error;
    }
  },

  async toggleRelay(id: number): Promise<Relay[]> {
    try {
      const res = await fetch(`${API_BASE}/relays/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to toggle relay');
      const data = await res.json();
      return data.relays || [];
    } catch (error) {
      throw error;
    }
  },

  async batchControl(ids: number[], action: 'ON' | 'OFF'): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/relays/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action })
      });
      if (!res.ok) throw new Error('Failed to batch control');
    } catch (error) {
      throw error;
    }
  },

  async renameRelay(id: number, name: string): Promise<Relay> {
    try {
      const res = await fetch(`${API_BASE}/relays/${id}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error('Failed to rename relay');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async setRelayIcon(id: number, iconType: RelayType): Promise<Relay> {
    try {
      const res = await fetch(`${API_BASE}/relays/${id}/icon`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iconType })
      });
      if (!res.ok) throw new Error('Failed to set icon');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async setRelayColorGroup(id: number, colorGroup: Relay['colorGroup']): Promise<Relay> {
    try {
      const res = await fetch(`${API_BASE}/relays/${id}/group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorGroup })
      });
      if (!res.ok) throw new Error('Failed to set color group');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async setRelayVisibility(id: number, isHidden: boolean): Promise<Relay> {
    try {
      const res = await fetch(`${API_BASE}/relays/${id}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isHidden })
      });
      if (!res.ok) throw new Error('Failed to set visibility');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async addSchedule(schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    try {
      const res = await fetch(`${API_BASE}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      });
      if (!res.ok) throw new Error('Failed to add schedule');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async deleteSchedule(id: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete schedule');
    } catch (error) {
      throw error;
    }
  },

  async updateSchedule(id: string, schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    try {
      const res = await fetch(`${API_BASE}/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule)
      });
      if (!res.ok) throw new Error('Failed to update schedule');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async addGroup(group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    try {
      const res = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(group)
      });
      if (!res.ok) throw new Error('Failed to add group');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async updateGroup(id: string, group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    try {
      const res = await fetch(`${API_BASE}/groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(group)
      });
      if (!res.ok) throw new Error('Failed to update group');
      return await res.json();
    } catch (error) {
      throw error;
    }
  },

  async deleteGroup(id: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/groups/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete group');
    } catch (error) {
      throw error;
    }
  },

  async toggleGroup(id: string, action: 'ON' | 'OFF'): Promise<Relay[]> {
    try {
      const res = await fetch(`${API_BASE}/groups/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (!res.ok) throw new Error('Failed to toggle group');
      const data = await res.json();
      return data.relays || [];
    } catch (error) {
      throw error;
    }
  }
};
