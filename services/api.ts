
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
const AGENT_SECRET = (import.meta as any).env?.VITE_AGENT_SECRET || 'secret';

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
  async listAgents(): Promise<{ agentId: string; lastHeartbeat: number | null; online: boolean }[]> {
    const res = await request(`${API_BASE}/agents`);
    return await res.json();
  },

  async registerAgent(agentId: string, secret: string): Promise<void> {
    await request(`${API_BASE}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, secret: secret || AGENT_SECRET })
    });
  },

  async deleteAgent(agentId: string): Promise<void> {
    await request(`${API_BASE}/agents/${agentId}`, { method: 'DELETE' });
  },

  async getStatus(agentId?: string): Promise<{ relays: Relay[], schedules: Schedule[], groups: RelayGroup[], isMock: boolean, agentId?: string, lastHeartbeat?: number | null }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const id = agentId || AGENT_ID;
    const res = await request(`${API_BASE}/dashboard?agentId=${encodeURIComponent(id)}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return await res.json();
  },

  async setRelayState(agentId: string, id: number, state: 'on' | 'off'): Promise<void> {
    await request(`${API_BASE}/agents/${agentId}/relays/${id}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });
  },

  async batchControl(agentId: string, ids: number[], action: 'ON' | 'OFF'): Promise<void> {
    await Promise.all(ids.map(id => this.setRelayState(agentId, id, action === 'ON' ? 'on' : 'off')));
  },

  async renameRelay(agentId: string, id: number, name: string): Promise<Relay> {
    await request(`${API_BASE}/agents/${agentId}/relays/${id}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return { id, name } as Relay;
  },

  async setRelayIcon(agentId: string, id: number, iconType: RelayType): Promise<Relay> {
    await request(`${API_BASE}/agents/${agentId}/relays/${id}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ iconType })
    });
    return { id, iconType } as Relay;
  },

  async setRelayVisibility(agentId: string, id: number, isHidden: boolean): Promise<Relay> {
    await request(`${API_BASE}/agents/${agentId}/relays/${id}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHidden })
    });
    return { id, isHidden } as Relay;
  },

  async addSchedule(agentId: string, schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const res = await request(`${API_BASE}/agents/${agentId}/schedules`, {
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

  async deleteSchedule(agentId: string, _id: string): Promise<void> {
    await request(`${API_BASE}/agents/${agentId}/schedules/${_id}`, { method: 'DELETE' });
  },

  async updateSchedule(agentId: string, id: string, schedule: Omit<Schedule, 'id'>): Promise<Schedule> {
    const res = await request(`${API_BASE}/agents/${agentId}/schedules/${id}`, {
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

  async addGroup(agentId: string, group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    const res = await request(`${API_BASE}/agents/${agentId}/groups`, {
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

  async updateGroup(agentId: string, id: string, group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    const res = await request(`${API_BASE}/agents/${agentId}/groups/${id}`, {
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

  async deleteGroup(agentId: string, _id: string): Promise<void> {
    await request(`${API_BASE}/agents/${agentId}/groups/${_id}`, { method: 'DELETE' });
  },

  async toggleGroup(agentId: string, _id: string, _action: 'ON' | 'OFF'): Promise<Relay[]> {
    await request(`${API_BASE}/agents/${agentId}/groups/${_id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: _action })
    });
    return [];
  }
};
