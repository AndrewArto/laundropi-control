
import { Relay, Schedule, RelayType, RelayGroup } from '../types';

const API_BASE = (() => {
  if (typeof window === 'undefined') return '/api';
  const { hostname, port, protocol } = window.location;
  if (port === '3000') {
    return `${protocol}//${hostname}:4000/api`;
  }
  return '/api';
})();

const AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID || 'dev-agent';

const request = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res;
};

const normalizeTime = (val?: string | null) => {
  if (!val) return null;
  const raw = val.trim();
  const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (ampm) {
    let hh = parseInt(ampm[1], 10);
    const mm = ampm[2];
    const suffix = ampm[3].toUpperCase();
    if (suffix === 'PM' && hh !== 12) hh += 12;
    if (suffix === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    const hh = Math.min(Math.max(parseInt(hhmm[1], 10), 0), 23);
    const mm = Math.min(Math.max(parseInt(hhmm[2], 10), 0), 59);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return null;
};

export const ApiService = {
  async getStatus(): Promise<{ relays: Relay[], schedules: Schedule[], groups: RelayGroup[], isMock: boolean, agentId?: string, lastHeartbeat?: number | null }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await request(`${API_BASE}/dashboard?agentId=${encodeURIComponent(AGENT_ID)}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return await res.json();
  },

  async setRelayState(id: number, state: 'on' | 'off'): Promise<void> {
    await request(`${API_BASE}/agents/${AGENT_ID}/relays/${id}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
  },

  async batchControl(ids: number[], action: 'ON' | 'OFF'): Promise<void> {
    await Promise.all(ids.map(id => this.setRelayState(id, action === 'ON' ? 'on' : 'off')));
  },

  async renameRelay(id: number, name: string): Promise<Relay> {
    await request(`${API_BASE}/agents/${AGENT_ID}/relays/${id}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return { id, name } as Relay;
  },

  async setRelayIcon(id: number, iconType: RelayType): Promise<Relay> {
    await request(`${API_BASE}/agents/${AGENT_ID}/relays/${id}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iconType })
    });
    return { id, iconType } as Relay;
  },

  async setRelayVisibility(id: number, isHidden: boolean): Promise<Relay> {
    await request(`${API_BASE}/agents/${AGENT_ID}/relays/${id}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHidden })
    });
    return { id, isHidden } as Relay;
  },

  async addSchedule(schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const res = await request(`${API_BASE}/agents/${AGENT_ID}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...schedule,
        time: undefined,
        from: normalizeTime((schedule as any).from) || null,
        to: normalizeTime((schedule as any).to) || null,
      })
    });
    return await res.json();
  },

  async deleteSchedule(_id: string): Promise<void> {
    await request(`${API_BASE}/agents/${AGENT_ID}/schedules/${_id}`, { method: 'DELETE' });
  },

  async updateSchedule(id: string, schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const res = await request(`${API_BASE}/agents/${AGENT_ID}/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...schedule,
        time: undefined,
        from: normalizeTime((schedule as any).from) || null,
        to: normalizeTime((schedule as any).to) || null,
      })
    });
    return await res.json();
  },

  async addGroup(group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    const res = await request(`${API_BASE}/agents/${AGENT_ID}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...group,
        onTime: normalizeTime(group.onTime as any),
        offTime: normalizeTime(group.offTime as any),
      })
    });
    return await res.json();
  },

  async updateGroup(id: string, group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    const res = await request(`${API_BASE}/agents/${AGENT_ID}/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...group,
        onTime: normalizeTime(group.onTime as any),
        offTime: normalizeTime(group.offTime as any),
      })
    });
    return await res.json();
  },

  async deleteGroup(_id: string): Promise<void> {
    await request(`${API_BASE}/agents/${AGENT_ID}/groups/${_id}`, { method: 'DELETE' });
  },

  async toggleGroup(_id: string, _action: 'ON' | 'OFF'): Promise<Relay[]> {
    await request(`${API_BASE}/agents/${AGENT_ID}/groups/${_id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: _action })
    });
    return [];
  }
};
