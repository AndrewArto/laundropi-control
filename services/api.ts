
import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, RevenueDeduction, UiUser, CameraConfig, ExpenditureImport, ExpenditureTransaction, ExpenditureAudit, LaundryMachineStatus } from '../types';

type LocationLike = { hostname: string; port: string; protocol: string };

export const resolveBaseUrl = (options?: { envBase?: string; location?: LocationLike | null }) => {
  const envBase = (typeof options?.envBase === 'string' ? options.envBase : (import.meta as any).env?.VITE_CENTRAL_URL) || '';
  if (envBase.trim()) {
    return envBase.trim().replace(/\/$/, '');
  }
  // When no VITE_CENTRAL_URL is set, use relative URLs (go through Vite proxy in dev)
  return '';
};

const BASE_URL = resolveBaseUrl();

const API_BASE = BASE_URL ? `${BASE_URL}/api` : '/api';
const AUTH_BASE = BASE_URL ? `${BASE_URL}/auth` : '/auth';

const AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID || 'dev-agent';
const AGENT_SECRET = (import.meta as any).env?.VITE_AGENT_SECRET || 'secret';
const request = async (input: RequestInfo | URL, init?: RequestInit & { timeout?: number }) => {
  const headers = new Headers(init?.headers || {});
  const { timeout, ...fetchInit } = init || {};

  // Create abort controller for timeout
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeout) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }

  try {
    const res = await fetch(input, {
      ...fetchInit,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      let errorData: any = null;
      try {
        errorData = JSON.parse(text);
      } catch {
        // Not JSON, use text as message
      }
      const message = errorData?.message || text;
      const err = new Error(`API ${res.status}: ${message}`);
      (err as any).status = res.status;
      // Preserve parsed error data (e.g., existingImport for duplicate files)
      if (errorData) {
        Object.assign(err, errorData);
      }
      throw err;
    }
    return res;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
  async get<T = any>(path: string): Promise<T> {
    const url = path.startsWith('/api') || path.startsWith('/auth') ? `${BASE_URL}${path}` : path;
    const res = await request(url);
    return await res.json();
  },

  async post<T = any>(path: string, body?: any): Promise<T> {
    const url = path.startsWith('/api') || path.startsWith('/auth') ? `${BASE_URL}${path}` : path;
    const res = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  },

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

  async getMachineStatus(agentId: string): Promise<LaundryMachineStatus> {
    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/machines`);
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

  async listRevenueEntryDates(startDate: string, endDate: string, agentId?: string): Promise<{
    dates: string[];
    dateInfo: Array<{ date: string; hasRevenue: boolean; hasExpenses: boolean }>;
  }> {
    const query = new URLSearchParams({ startDate, endDate });
    if (agentId) query.set('agentId', agentId);
    const res = await request(`${API_BASE}/revenue/dates?${query.toString()}`);
    const payload = await res.json();
    return {
      dates: payload.dates || [],
      dateInfo: payload.dateInfo || [],
    };
  },

  // ========== Expenditure / Bank Import ==========

  async uploadBankCsv(csvContent: string, fileName: string): Promise<{
    import: ExpenditureImport;
    transactions: ExpenditureTransaction[];
    parseWarnings: string[];
    autoIgnoredCount: number;
  }> {
    const res = await request(`${API_BASE}/expenditure/imports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv',
        'X-Filename': fileName,
      },
      body: csvContent,
      timeout: 10000, // 10 second timeout
    });
    return await res.json();
  },

  async listExpenditureImports(): Promise<{ imports: ExpenditureImport[] }> {
    const res = await request(`${API_BASE}/expenditure/imports`);
    return await res.json();
  },

  async getExpenditureImport(importId: string): Promise<{
    import: ExpenditureImport;
    transactions: ExpenditureTransaction[];
    summary: { total: number; new: number; existing: number; discrepancy: number; ignored: number };
    audit: ExpenditureAudit[];
  }> {
    const res = await request(`${API_BASE}/expenditure/imports/${encodeURIComponent(importId)}`);
    return await res.json();
  },

  async updateExpenditureImport(importId: string, status: 'reconciling' | 'completed' | 'cancelled', notes?: string): Promise<{ import: ExpenditureImport }> {
    const res = await request(`${API_BASE}/expenditure/imports/${encodeURIComponent(importId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    });
    return await res.json();
  },

  async deleteExpenditureImport(importId: string): Promise<void> {
    await request(`${API_BASE}/expenditure/imports/${encodeURIComponent(importId)}`, {
      method: 'DELETE',
    });
  },

  async updateExpenditureTransaction(transactionId: string, updates: {
    reconciliationStatus?: 'new' | 'existing' | 'discrepancy' | 'ignored';
    assignedAgentId?: string | null;
    matchedDeductionKey?: string | null;
    reconciliationNotes?: string | null;
  }): Promise<{ transaction: ExpenditureTransaction }> {
    const res = await request(`${API_BASE}/expenditure/transactions/${encodeURIComponent(transactionId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return await res.json();
  },

  async assignExpenditureTransaction(transactionId: string, agentId: string, entryDate?: string, comment?: string): Promise<{
    transaction: ExpenditureTransaction;
    revenueEntry: RevenueEntry;
    deductionKey: string;
  }> {
    const res = await request(`${API_BASE}/expenditure/transactions/${encodeURIComponent(transactionId)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, entryDate, comment }),
    });
    return await res.json();
  },

  async assignStripeCredit(transactionId: string, agentId: string, entryDate?: string): Promise<{
    transaction: ExpenditureTransaction;
    revenueEntry: RevenueEntry;
  }> {
    const res = await request(`${API_BASE}/expenditure/transactions/${encodeURIComponent(transactionId)}/assign-stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, entryDate }),
    });
    return await res.json();
  },

  async listExpenditureDeductions(startDate: string, endDate: string): Promise<{
    deductions: Array<{
      key: string;
      agentId: string;
      entryDate: string;
      amount: number;
      comment: string;
      index: number;
    }>;
  }> {
    const query = new URLSearchParams({ startDate, endDate });
    const res = await request(`${API_BASE}/expenditure/deductions?${query.toString()}`);
    return await res.json();
  },
};
