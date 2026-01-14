
import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, RevenueDeduction, UiUser, CameraConfig } from '../types';

const BASE_URL = (() => {
  if (typeof window === 'undefined') return '';
  const envBase = (import.meta as any).env?.VITE_CENTRAL_URL;
  if (typeof envBase === 'string' && envBase.trim()) {
    return envBase.trim().replace(/\/$/, '');
  }
  const { hostname, port, protocol } = window.location;
  if (port === '3000') {
    return `${protocol}//${hostname}:4000`;
  }
  return '';
})();

const API_BASE = BASE_URL ? `${BASE_URL}/api` : '/api';
const AUTH_BASE = BASE_URL ? `${BASE_URL}/auth` : '/auth';

const AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID || 'dev-agent';
const AGENT_SECRET = (import.meta as any).env?.VITE_AGENT_SECRET || 'secret';
const request = async (input: RequestInfo | URL, init?: RequestInit) => {
  const headers = new Headers(init?.headers || {});
  const res = await fetch(input, { ...init, headers, credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`API ${res.status}: ${text}`);
    (err as any).status = res.status;
    throw err;
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

const toEntries = (agentId: string, group: Partial<RelayGroup>): { agentId: string; relayIds: number[] }[] => {
  if (Array.isArray(group.entries) && group.entries.length) {
    return group.entries.map(e => ({
      agentId: e.agentId,
      relayIds: Array.isArray(e.relayIds) ? e.relayIds.map(Number) : [],
    }));
  }
  const ids = Array.isArray(group.relayIds) ? group.relayIds.map(Number) : [];
  return ids.length ? [{ agentId, relayIds: ids }] : [];
};

type RevenueEntryInput = {
  entryDate: string;
  coinsTotal: number;
  euroCoinsCount: number;
  billsTotal: number;
  deductions: RevenueDeduction[];
};

type RevenueEntryListParams = {
  startDate?: string;
  endDate?: string;
  agentId?: string;
};

export const ApiService = {
  async getSession(): Promise<{ user: { username: string; role: string } | null }> {
    const res = await request(`${AUTH_BASE}/session`);
    return await res.json();
  },

  async login(username: string, password: string): Promise<{ user: { username: string; role: string } }> {
    const res = await request(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return await res.json();
  },

  async logout(): Promise<void> {
    await request(`${AUTH_BASE}/logout`, { method: 'POST' });
  },

  async listUsers(): Promise<UiUser[]> {
    const res = await request(`${API_BASE}/users`);
    return await res.json();
  },

  async createUser(username: string, password: string, role: 'admin' | 'user'): Promise<void> {
    await request(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
  },

  async updateUserRole(username: string, role: 'admin' | 'user'): Promise<void> {
    await request(`${API_BASE}/users/${encodeURIComponent(username)}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
  },

  async updateUserPassword(username: string, password: string): Promise<void> {
    await request(`${API_BASE}/users/${encodeURIComponent(username)}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
  },

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

  async listCameras(agentId: string): Promise<{ cameras: CameraConfig[] }> {
    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/cameras`);
    return await res.json();
  },

  async updateCamera(agentId: string, cameraId: string, payload: Partial<CameraConfig> & { username?: string | null; password?: string | null }): Promise<{ camera: CameraConfig }> {
    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/cameras/${encodeURIComponent(cameraId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
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
    const entries = toEntries(agentId, group);
    const res = await request(`${API_BASE}/agents/${agentId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...group,
        entries,
        onTime: normalizeTime(group.onTime as any),
        offTime: normalizeTime(group.offTime as any),
      })
    });
    return await res.json();
  },

  async updateGroup(agentId: string, id: string, group: Omit<RelayGroup, 'id'>): Promise<RelayGroup> {
    const entries = toEntries(agentId, group);
    const res = await request(`${API_BASE}/agents/${agentId}/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...group,
        entries,
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
  },

  async getRevenueEntry(agentId: string, date: string): Promise<{ entry: RevenueEntry | null; audit: RevenueAuditEntry[] }> {
    const res = await request(`${API_BASE}/revenue/${encodeURIComponent(agentId)}?date=${encodeURIComponent(date)}`);
    return await res.json();
  },

  async saveRevenueEntry(agentId: string, payload: RevenueEntryInput): Promise<{ entry: RevenueEntry; audit: RevenueAuditEntry[]; unchanged?: boolean }> {
    const res = await request(`${API_BASE}/revenue/${encodeURIComponent(agentId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  },

  async getRevenueSummary(date: string): Promise<{ date: string; week: RevenueSummary; month: RevenueSummary }> {
    const res = await request(`${API_BASE}/revenue/summary?date=${encodeURIComponent(date)}`);
    return await res.json();
  },

  async listRevenueEntries(params: RevenueEntryListParams = {}): Promise<RevenueEntry[]> {
    const query = new URLSearchParams();
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.agentId) query.set('agentId', params.agentId);
    const url = `${API_BASE}/revenue/entries${query.toString() ? `?${query.toString()}` : ''}`;
    const res = await request(url);
    const payload = await res.json();
    return payload.entries || [];
  },

  async listRevenueEntryDates(startDate: string, endDate: string, agentId?: string): Promise<string[]> {
    const query = new URLSearchParams({ startDate, endDate });
    if (agentId) query.set('agentId', agentId);
    const res = await request(`${API_BASE}/revenue/dates?${query.toString()}`);
    const payload = await res.json();
    return payload.dates || [];
  },
};
