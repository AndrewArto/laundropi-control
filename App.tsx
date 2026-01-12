import React, { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarClock, Settings, Trash2, Cpu, Server, Pencil, Plus, Lock, Coins, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown, ChevronUp, Download } from 'lucide-react';
import RelayCard from './components/RelayCard';
import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, UiUser } from './types';
import { ApiService } from './services/api';
import { DAYS_OF_WEEK } from './constants';

enum Tab {
  DASHBOARD = 'DASHBOARD',
  SCHEDULE = 'SCHEDULE',
  REVENUE = 'REVENUE',
  SETTINGS = 'SETTINGS'
}

const AGENT_STALE_MS = 8_000;
const PENDING_RELAY_TTL_MS = 5_000;
const DEFAULT_AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID ?? 'dev-agent';
const DEFAULT_AGENT_SECRET = (import.meta as any).env?.VITE_AGENT_SECRET ?? 'secret';
const IS_TEST_ENV = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || false;
const BRAND_LOGO_URL = '/washcontrol-logo.png?v=20260112';

const to24h = (val?: string | null): string | null => {
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

const normalizeTimeInput = (val: string): string => {
  const digits = val.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateParts = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const shiftDateByDays = (value: string, delta: number) => {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  date.setDate(date.getDate() + delta);
  return toDateInput(date);
};

const shiftDateByMonths = (value: string, delta: number) => {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const base = new Date(parts.year, parts.month - 1, 1);
  base.setMonth(base.getMonth() + delta);
  const nextYear = base.getFullYear();
  const nextMonth = base.getMonth() + 1;
  const maxDay = getDaysInMonth(nextYear, nextMonth);
  const day = Math.min(parts.day, maxDay);
  return toDateInput(new Date(nextYear, nextMonth - 1, day));
};

const getMonthRange = (value: string) => {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const daysInMonth = getDaysInMonth(parts.year, parts.month);
  const monthStr = String(parts.month).padStart(2, '0');
  return {
    startDate: `${parts.year}-${monthStr}-01`,
    endDate: `${parts.year}-${monthStr}-${String(daysInMonth).padStart(2, '0')}`,
    year: parts.year,
    month: parts.month,
    daysInMonth,
  };
};

const formatMoney = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

const makeDeductionId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatTimestamp = (ts: number) => new Date(ts).toLocaleString();
const formatLastLogin = (ts: number | null) => (ts ? formatTimestamp(ts) : 'Never');
const isRevenueNumericInput = (value: string) => /^(\d+([.,]\d*)?|[.,]\d*)?$/.test(value);
const normalizeDecimalInput = (value: string) => value.replace(',', '.');

const App: React.FC = () => {
  console.log('[LaundroPi] App mounted render cycle start');

  type Laundry = {
    id: string;
    name: string;
    relays: Relay[];
    isOnline: boolean;
    isMock: boolean;
    lastHeartbeat: number | null;
  };

  type RelaySelection = { agentId: string; relayId: number };

  type RevenueDraftDeduction = { id: string; amount: string; comment: string };
  type RevenueDraft = {
    coinsTotal: string;
    euroCoinsCount: string;
    billsTotal: string;
    deductions: RevenueDraftDeduction[];
  };

  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<{ username: string; role: string } | null>(null);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [relays, setRelays] = useState<Relay[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [groups, setGroups] = useState<RelayGroup[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSelections, setNewGroupSelections] = useState<RelaySelection[]>([]);
  const [newGroupOnTime, setNewGroupOnTime] = useState<string>('');
  const [newGroupOffTime, setNewGroupOffTime] = useState<string>('');
  const [newGroupDays, setNewGroupDays] = useState<string[]>([...DAYS_OF_WEEK]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupSelectionTouched, setGroupSelectionTouched] = useState(false);
  const [isNewGroupVisible, setIsNewGroupVisible] = useState(false);
  const latestRelaysRef = React.useRef<Relay[]>([]);
  const [isRelayEditMode, setIsRelayEditMode] = useState(false);
  const isRelayEditModeRef = React.useRef(false);
  const editingGroupIdRef = React.useRef<string | null>(null);
  const relayEditAreaRef = React.useRef<HTMLDivElement | null>(null);
  const groupEditAreaRef = React.useRef<HTMLDivElement | null>(null);
  const isAuthenticatedRef = React.useRef(false);
  const [relayNameDrafts, setRelayNameDrafts] = useState<Record<string, string>>({});
  const [relayVisibility, setRelayVisibility] = useState<Record<string, boolean>>({});
  const relayVisibilityRef = React.useRef<Record<string, boolean>>({});
  const [serverOnline, setServerOnline] = useState(true);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentHeartbeat, setAgentHeartbeat] = useState<number | null>(null);
  const agentOnline = agentHeartbeat !== null && (Date.now() - agentHeartbeat) < AGENT_STALE_MS;
  const controlsDisabled = IS_TEST_ENV ? false : (!serverOnline || !agentOnline);
  const [laundries, setLaundries] = useState<Laundry[]>([]);
  const isLaundryOnline = React.useCallback((laundry: Laundry) => {
    const fresh = laundry.lastHeartbeat ? (Date.now() - laundry.lastHeartbeat) < AGENT_STALE_MS : false;
    return serverOnline && laundry.isOnline && fresh;
  }, [serverOnline]);
  const offlineAgents = React.useMemo(
    () => laundries.filter(laundry => !isLaundryOnline(laundry)),
    [laundries, isLaundryOnline]
  );
  const offlineMessages = React.useMemo(() => {
    const messages: { key: string; tone: 'server' | 'agent'; text: string }[] = [];
    if (!serverOnline) {
      messages.push({
        key: 'server-offline',
        tone: 'server',
        text: 'Server unreachable. Controls are temporarily disabled until connection is restored.',
      });
    }
    offlineAgents.forEach(laundry => {
      messages.push({
        key: `agent-offline-${laundry.id}`,
        tone: 'agent',
        text: `Agent ${laundry.id} is offline. Controls are disabled until it reconnects.`,
      });
    });
    return messages;
  }, [serverOnline, offlineAgents]);
  const primaryAgentId = agentId || laundries[0]?.id || DEFAULT_AGENT_ID;
  const [isAddingLaundry, setIsAddingLaundry] = useState(false);
  const [newLaundryInput, setNewLaundryInput] = useState('');
  const [newLaundrySecret, setNewLaundrySecret] = useState(DEFAULT_AGENT_SECRET);
  const pendingRelayStatesRef = React.useRef<Map<string, { state: boolean; updatedAt: number }>>(new Map());
  const laundryIdKey = React.useMemo(() => laundries.map(l => l.id).sort().join('|'), [laundries]);

  const [revenueDate, setRevenueDate] = useState<string>(() => toDateInput(new Date()));
  const [revenueEntries, setRevenueEntries] = useState<Record<string, RevenueEntry | null>>({});
  const [revenueDrafts, setRevenueDrafts] = useState<Record<string, RevenueDraft>>({});
  const [revenueAudit, setRevenueAudit] = useState<Record<string, RevenueAuditEntry[]>>({});
  const [revenueSummary, setRevenueSummary] = useState<{ date: string; week: RevenueSummary; month: RevenueSummary } | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [revenueSaving, setRevenueSaving] = useState<Record<string, boolean>>({});
  const [revenueSaveErrors, setRevenueSaveErrors] = useState<Record<string, string | null>>({});
  const [revenueView, setRevenueView] = useState<'daily' | 'all'>('daily');
  const [revenueEntryDates, setRevenueEntryDates] = useState<string[]>([]);
  const [revenueAllEntries, setRevenueAllEntries] = useState<RevenueEntry[]>([]);
  const [revenueAllLoading, setRevenueAllLoading] = useState(false);
  const [revenueAllError, setRevenueAllError] = useState<string | null>(null);
  const [isRevenueCalendarOpen, setIsRevenueCalendarOpen] = useState(false);

  const [users, setUsers] = useState<UiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userCreateError, setUserCreateError] = useState<string | null>(null);
  const [userCreateLoading, setUserCreateLoading] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [userRoleDrafts, setUserRoleDrafts] = useState<Record<string, 'admin' | 'user'>>({});
  const [userPasswordDrafts, setUserPasswordDrafts] = useState<Record<string, string>>({});
  const [userSaving, setUserSaving] = useState<Record<string, boolean>>({});
  const [userSaveErrors, setUserSaveErrors] = useState<Record<string, string | null>>({});

  const applyVisibility = (agentId: string, list: Relay[]) => {
    const visMap = relayVisibilityRef.current;
    return list.map(r => {
      const key = relayDraftKey(agentId, r.id);
      return visMap[key] !== undefined ? { ...r, isHidden: visMap[key] } : r;
    });
  };

  const selectionKey = (agentId: string, relayId: number) => `${agentId}__${relayId}`;
  const relayDraftKey = (agentId: string, relayId: number) => `${agentId}::${relayId}`;
  const relayPendingKey = (agentId: string, relayId: number) => `${agentId}::${relayId}`;
  const markPendingRelayState = (agentId: string, relayId: number, isOn: boolean) => {
    pendingRelayStatesRef.current.set(relayPendingKey(agentId, relayId), { state: isOn, updatedAt: Date.now() });
  };
  const applyPendingRelayStates = (items: Laundry[]) => {
    const pending = pendingRelayStatesRef.current;
    if (!pending.size) return items;
    const now = Date.now();
    let mutated = false;
    const merged = items.map(laundry => {
      let relaysChanged = false;
      const relays = (laundry.relays || []).map(relay => {
        const key = relayPendingKey(laundry.id, relay.id);
        const entry = pending.get(key);
        if (!entry) return relay;
        if (now - entry.updatedAt > PENDING_RELAY_TTL_MS) {
          pending.delete(key);
          return relay;
        }
        if (relay.isOn === entry.state) {
          pending.delete(key);
          return relay;
        }
        relaysChanged = true;
        return { ...relay, isOn: entry.state };
      });
      if (relaysChanged) {
        mutated = true;
        return { ...laundry, relays };
      }
      return laundry;
    });
    return mutated ? merged : items;
  };
  const dedupeSelections = (items: RelaySelection[]) => {
    const map = new Map<string, RelaySelection>();
    items.forEach(sel => {
      const key = selectionKey(sel.agentId, sel.relayId);
      map.set(key, sel);
    });
    return Array.from(map.values());
  };

  const normalizeGroupPayload = (g: any, fallbackAgentId: string): RelayGroup => {
    const entries = Array.isArray(g?.entries) && g.entries.length
      ? g.entries.map((e: any) => ({
          agentId: e.agentId,
          relayIds: Array.isArray(e.relayIds) ? e.relayIds.map((rid: any) => Number(rid)) : [],
        })).filter((e: any) => e.agentId)
      : [{
          agentId: g.agentId || fallbackAgentId,
          relayIds: Array.isArray(g.relayIds) ? g.relayIds.map((rid: any) => Number(rid)) : [],
        }];
    return {
      ...g,
      entries,
      relayIds: Array.isArray(g.relayIds) ? g.relayIds : entries.flatMap((e: any) => e.relayIds),
    };
  };

  const resetUiState = () => {
    setRelays([]);
    setSchedules([]);
    setGroups([]);
    setRelayNameDrafts({});
    setRelayVisibility({});
    relayVisibilityRef.current = {};
    latestRelaysRef.current = [];
    setLaundries([]);
    setAgentId(null);
    setAgentHeartbeat(null);
    setIsMockMode(true);
    setIsRelayEditMode(false);
    isRelayEditModeRef.current = false;
    setNewGroupName('');
    setNewGroupSelections([]);
    setNewGroupOnTime('');
    setNewGroupOffTime('');
    setNewGroupDays([...DAYS_OF_WEEK]);
    setGroupSelectionTouched(false);
    setEditingGroupId(null);
    editingGroupIdRef.current = null;
    setServerOnline(true);
    setRevenueEntries({});
    setRevenueDrafts({});
    setRevenueAudit({});
    setRevenueSummary(null);
    setRevenueLoading(false);
    setRevenueError(null);
    setRevenueSaving({});
    setRevenueSaveErrors({});
    setRevenueView('daily');
    setRevenueEntryDates([]);
    setRevenueAllEntries([]);
    setRevenueAllLoading(false);
    setRevenueAllError(null);
    setIsRevenueCalendarOpen(false);
    setRevenueDate(toDateInput(new Date()));
    setUsers([]);
    setUsersLoading(false);
    setUsersError(null);
    setUserCreateError(null);
    setUserCreateLoading(false);
    setNewUserName('');
    setNewUserPassword('');
    setNewUserRole('user');
    setUserRoleDrafts({});
    setUserPasswordDrafts({});
    setUserSaving({});
    setUserSaveErrors({});
  };

  const buildRevenueDraft = (entry: RevenueEntry | null): RevenueDraft => ({
    coinsTotal: entry ? formatMoney(entry.coinsTotal) : '',
    euroCoinsCount: entry ? String(entry.euroCoinsCount) : '',
    billsTotal: entry ? formatMoney(entry.billsTotal) : '',
    deductions: entry?.deductions?.map(d => ({
      id: makeDeductionId(),
      amount: formatMoney(d.amount),
      comment: d.comment,
    })) || [],
  });

  const parseMoneyInput = (value: string) => {
    if (!value.trim()) return 0;
    const num = Number(normalizeDecimalInput(value.trim()));
    if (!Number.isFinite(num) || num < 0) return null;
    return Math.round(num * 100) / 100;
  };

  const parseCountInput = (value: string) => {
    if (!value.trim()) return 0;
    const num = Number(normalizeDecimalInput(value.trim()));
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return null;
    return num;
  };

  const normalizeDeductionDrafts = (drafts: RevenueDraftDeduction[]) => {
    const normalized: { amount: number; comment: string }[] = [];
    for (const item of drafts) {
      const amountText = item.amount.trim();
      const comment = item.comment.trim();
      if (!amountText && !comment) continue;
      if (!comment) return { error: 'Deduction comment is required.', list: [] };
      const amount = parseMoneyInput(amountText);
      if (amount === null) return { error: 'Deduction amount must be a non-negative number.', list: [] };
      normalized.push({ amount, comment });
    }
    return { error: null, list: normalized };
  };

  const getLatestAudit = (agentId: string, field: string) => {
    const list = revenueAudit[agentId] || [];
    return list.find(entry => entry.field === field && entry.oldValue !== null) || null;
  };

  const getDeductionSummary = (raw: string | null) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const sum = parsed.reduce((acc, item) => {
        const amount = Number(item?.amount);
        return Number.isFinite(amount) ? acc + amount : acc;
      }, 0);
      return { count: parsed.length, total: Math.round(sum * 100) / 100 };
    } catch {
      return null;
    }
  };

  const handleAuthFailure = (err: unknown) => {
    const status = (err as any)?.status;
    if (status !== 401) return false;
    setAuthError('Session expired. Please sign in again.');
    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    setAuthUser(null);
    setAuthPassword('');
    setActiveTab(Tab.DASHBOARD);
    resetUiState();
    setIsLoading(false);
    return true;
  };

  const [isMockMode, setIsMockMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // DOM snapshot debug
  useEffect(() => {
    const root = document.getElementById('root');
    console.log('[LaundroPi] DOM snapshot childCount:', root?.childElementCount, 'innerHTML len:', root?.innerHTML.length);
  });

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const session = await ApiService.getSession();
        if (cancelled) return;
        if (session?.user) {
          setIsAuthenticated(true);
          setAuthUser(session.user);
          setActiveTab(session.user.role === 'admin' ? Tab.REVENUE : Tab.DASHBOARD);
          setIsLoading(true);
        } else {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIsAuthenticated(false);
          setAuthUser(null);
          setIsLoading(false);
        }
      } finally {
        if (!cancelled) setIsAuthReady(true);
      }
    };
    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // Fetch data
  const fetchLaundries = async (force = false) => {
    try {
      if (isRelayEditModeRef.current && !force) {
        setIsLoading(false);
        return;
      }
      const agentIndex = await ApiService.listAgents();
      let primaryData: { schedules: Schedule[]; groups: RelayGroup[] } | null = null;
      const items: Laundry[] = await Promise.all(agentIndex.map(async (agent) => {
        try {
          const data = await ApiService.getStatus(agent.agentId);
          const lastHb = agent.lastHeartbeat ?? data.lastHeartbeat ?? null;
          const online = Boolean(agent.online) && (lastHb ? (Date.now() - lastHb) < AGENT_STALE_MS : true);
          if (!primaryData) {
            primaryData = { schedules: data.schedules, groups: data.groups };
          }
          return {
            id: agent.agentId,
            name: agent.agentId,
            relays: data.relays,
            isOnline: online,
            isMock: data.isMock,
            lastHeartbeat: lastHb,
          };
        } catch (e) {
          return {
            id: agent.agentId,
            name: agent.agentId,
            relays: [],
            isOnline: false,
            isMock: true,
            lastHeartbeat: agent.lastHeartbeat ?? null,
          };
        }
      }));

      setServerOnline(true);
      if (!isAuthenticatedRef.current) {
        setIsLoading(false);
        return;
      }

      setLaundries(applyPendingRelayStates(items));
      if (primaryData) {
        setSchedules(primaryData.schedules);
        setGroups(prev => {
          if (primaryData?.groups && primaryData.groups.length > 0) {
            return primaryData.groups.map(g => normalizeGroupPayload(g, items[0]?.id || primaryAgentId || DEFAULT_AGENT_ID));
          }
          return prev;
        });
      } else {
        setSchedules([]);
        setGroups([]);
      }
      setIsLoading(false);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Critical Failure:', err);
      setServerOnline(false);
      setIsLoading(false);
      setAgentHeartbeat(null);
    }
  };

  const refreshConnectivityOnly = async () => {
    try {
      const agentIndex = await ApiService.listAgents();
      setServerOnline(true);
      if (agentIndex.length === 0) {
        setLaundries([]);
        return;
      }
      setLaundries(prev => {
        const prevMap = new Map(prev.map(l => [l.id, l]));
        return agentIndex.map(agent => {
          const existing = prevMap.get(agent.agentId);
          const lastHb = agent.lastHeartbeat ?? existing?.lastHeartbeat ?? null;
          const online = Boolean(agent.online) && (lastHb ? (Date.now() - lastHb) < AGENT_STALE_MS : true);
          return {
            id: agent.agentId,
            name: existing?.name || agent.agentId,
            relays: existing?.relays || [],
            isOnline: online,
            isMock: existing?.isMock ?? true,
            lastHeartbeat: lastHb,
          };
        });
      });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Connectivity refresh failed', err);
      setServerOnline(false);
    }
  };

  const fetchRevenueData = async () => {
    if (!laundryIdKey) {
      setRevenueEntries({});
      setRevenueDrafts({});
      setRevenueAudit({});
      setRevenueSummary(null);
      return;
    }
    setRevenueLoading(true);
    setRevenueError(null);
    try {
      const date = revenueDate;
      const results = await Promise.all(laundries.map(async (laundry) => {
        const response = await ApiService.getRevenueEntry(laundry.id, date);
        return {
          agentId: laundry.id,
          entry: response?.entry ?? null,
          audit: response?.audit ?? [],
        };
      }));
      const entryMap: Record<string, RevenueEntry | null> = {};
      const draftMap: Record<string, RevenueDraft> = {};
      const auditMap: Record<string, RevenueAuditEntry[]> = {};
      results.forEach(({ agentId: id, entry, audit }) => {
        entryMap[id] = entry;
        draftMap[id] = buildRevenueDraft(entry || null);
        auditMap[id] = audit || [];
      });
      setRevenueEntries(entryMap);
      setRevenueDrafts(draftMap);
      setRevenueAudit(auditMap);
      setRevenueSaveErrors({});
      const summary = await ApiService.getRevenueSummary(date);
      setRevenueSummary(summary);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue fetch failed', err);
      setRevenueError('Unable to load revenue data.');
    } finally {
      setRevenueLoading(false);
    }
  };

  const fetchRevenueEntryDates = async () => {
    const range = getMonthRange(revenueDate);
    if (!range) {
      setRevenueEntryDates([]);
      return;
    }
    try {
      const dates = await ApiService.listRevenueEntryDates(range.startDate, range.endDate);
      setRevenueEntryDates(dates);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue calendar fetch failed', err);
      setRevenueEntryDates([]);
    }
  };

  const fetchAllRevenueEntries = async () => {
    setRevenueAllLoading(true);
    setRevenueAllError(null);
    try {
      const entries = await ApiService.listRevenueEntries();
      setRevenueAllEntries(entries);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue list fetch failed', err);
      setRevenueAllError('Unable to load revenue entries.');
    } finally {
      setRevenueAllLoading(false);
    }
  };

  const csvEscape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const formatCsvTimestamp = (ts: number | null) => (ts ? new Date(ts).toISOString() : '');

  const handleExportRevenueCsv = () => {
    if (!revenueAllEntries.length) return;
    const laundryNameMap = new Map(laundries.map(l => [l.id, l.name]));
    const header = [
      'entryDate',
      'laundry',
      'coinsTotal',
      'euroCoinsCount',
      'billsTotal',
      'deductionsTotal',
      'deductions',
      'updatedBy',
      'updatedAt',
      'createdBy',
      'createdAt',
    ];
    const rows = revenueAllEntries.map(entry => {
      const deductions = (entry.deductions || [])
        .map(item => `${formatMoney(item.amount)}:${item.comment}`)
        .join(' | ');
      return [
        entry.entryDate,
        laundryNameMap.get(entry.agentId) || entry.agentId,
        formatMoney(entry.coinsTotal),
        entry.euroCoinsCount,
        formatMoney(entry.billsTotal),
        formatMoney(entry.deductionsTotal),
        deductions,
        entry.updatedBy || '',
        formatCsvTimestamp(entry.updatedAt),
        entry.createdBy || '',
        formatCsvTimestamp(entry.createdAt),
      ];
    });
    const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `revenue-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await ApiService.listUsers();
      setUsers(list);
      const roleDrafts: Record<string, 'admin' | 'user'> = {};
      list.forEach(user => {
        roleDrafts[user.username] = user.role;
      });
      setUserRoleDrafts(roleDrafts);
      setUserSaveErrors({});
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('User list fetch failed', err);
      setUsersError('Unable to load users.');
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    fetchLaundries();
    const poller = setInterval(() => {
      if (isRelayEditModeRef.current || editingGroupIdRef.current) {
        refreshConnectivityOnly();
        return;
      }
      fetchLaundries();
    }, 2000);
    return () => clearInterval(poller);
  }, [isAuthenticated]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    isRelayEditModeRef.current = isRelayEditMode;
  }, [isRelayEditMode]);

  useEffect(() => {
    editingGroupIdRef.current = editingGroupId;
  }, [editingGroupId]);

  useEffect(() => {
    if (!isRelayEditMode && !editingGroupId) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-edit-toggle]')) return;

      const relayInside = relayEditAreaRef.current?.contains(target);
      const groupInside = groupEditAreaRef.current?.contains(target);

      if (isRelayEditMode && !relayInside) {
        setIsRelayEditMode(false);
        fetchLaundries(true);
      }
      if (editingGroupId && !groupInside) {
        setEditingGroupId(null);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isRelayEditMode, editingGroupId, fetchLaundries]);

  useEffect(() => {
    relayVisibilityRef.current = relayVisibility;
  }, [relayVisibility]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.REVENUE || revenueView !== 'daily') return;
    fetchRevenueData();
  }, [activeTab, revenueDate, laundryIdKey, isAuthenticated, authUser?.role, revenueView]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.REVENUE || revenueView !== 'daily') return;
    fetchRevenueEntryDates();
  }, [activeTab, revenueDate, laundryIdKey, isAuthenticated, authUser?.role, revenueView]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.REVENUE || revenueView !== 'all') return;
    fetchAllRevenueEntries();
  }, [activeTab, revenueView, isAuthenticated, authUser?.role]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.SETTINGS) return;
    fetchUsers();
  }, [activeTab, isAuthenticated, authUser?.role]);

  useEffect(() => {
    const primary = laundries[0];
    if (primary) {
      setRelays(primary.relays);
      setIsMockMode(primary.isMock);
      setAgentId(primary.id);
      setAgentHeartbeat(primary.lastHeartbeat);
    } else {
      setRelays([]);
      setAgentId(null);
      setAgentHeartbeat(null);
      setIsMockMode(true);
    }
  }, [laundries]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const login = await ApiService.login(authLogin.trim(), authPassword);
      setIsAuthenticated(true);
      isAuthenticatedRef.current = true;
      const nextUser = login.user || { username: authLogin.trim(), role: 'user' };
      setAuthUser(nextUser);
      setActiveTab(nextUser.role === 'admin' ? Tab.REVENUE : Tab.DASHBOARD);
      setAuthPassword('');
      resetUiState();
      setIsLoading(true);
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 401) {
        setAuthError('Invalid username or password.');
      } else {
        setAuthError('Could not sign in. Please try again.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await ApiService.logout();
    } catch {
      // ignore logout failures
    }
    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    setAuthUser(null);
    setAuthLogin('');
    setAuthPassword('');
    setAuthError('');
    setActiveTab(Tab.DASHBOARD);
    resetUiState();
    setIsLoading(false);
  };

  // Sync drafts and visibility
  useEffect(() => {
    // Only prefill new-group selection when untouched (avoid clobbering user edits on polls)
    if (!groupSelectionTouched && newGroupSelections.length === 0 && laundries.length) {
      const visible = laundries.flatMap(l =>
        (l.relays || []).filter(r => !r.isHidden).map(r => ({ agentId: l.id, relayId: r.id }))
      );
      setNewGroupSelections(dedupeSelections(visible));
    }
    // Avoid overwriting draft names while in relay edit mode
    if (!isRelayEditMode) {
      const drafts: Record<string, string> = {};
      const visibility: Record<string, boolean> = {};
      laundries.forEach(l => {
        (l.relays || []).forEach(r => {
          const key = relayDraftKey(l.id, r.id);
          drafts[key] = r.name;
          visibility[key] = Boolean(r.isHidden);
        });
      });
      setRelayNameDrafts(drafts);
      setRelayVisibility(visibility);
    }
    // Adjust default new group times to empty if server provided meta without times
    if (!groupSelectionTouched && !newGroupOnTime && !newGroupOffTime) {
      setNewGroupOnTime('');
      setNewGroupOffTime('');
    }
    console.log('[LaundroPi] relays loaded:', relays.length, 'visible:', relays.filter(r => !r.isHidden).length);
  }, [relays, laundries, newGroupSelections.length, groupSelectionTouched, isRelayEditMode, newGroupOnTime, newGroupOffTime]);

  // Drop hidden relays from schedules
  useEffect(() => {
    if (!relays.length) return;
    setSchedules(prev => prev.map(s => ({
      ...s,
      relayIds: s.relayIds.filter(id => {
        const relay = relays.find(r => r.id === id);
        return relay && !relay.isHidden;
      })
    })));
  }, [relays]);

  // Drop hidden relays from groups so toggles don't touch hidden devices
  useEffect(() => {
    if (!laundries.length) return;
    const visibleMap = new Map<string, Set<number>>();
    laundries.forEach(l => {
      visibleMap.set(l.id, new Set((l.relays || []).filter(r => !r.isHidden).map(r => r.id)));
    });
    setGroups(prev => prev.map(g => {
      const entries = (g.entries || []).map(e => {
        const allowed = visibleMap.get(e.agentId);
        const relayIds = allowed ? e.relayIds.filter(id => allowed.has(id)) : [];
        return { ...e, relayIds };
      }).filter(e => e.relayIds.length);
      return { ...g, entries, relayIds: entries.flatMap(e => e.relayIds) };
    }));
  }, [laundries]);

  const updateLaundryRelays = (id: string, updater: (relays: Relay[]) => Relay[]) => {
    setLaundries(prev => prev.map(l => l.id === id ? { ...l, relays: updater(l.relays) } : l));
  };

  const handleAddLaundry = async () => {};

  const handleRemoveLaundry = (_id: string) => {};

  const handleRenameLaundry = async (_id: string, _name: string) => {};

  const handleToggleRelay = async (id: number, agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const laundry = laundries.find(l => l.id === agent);
    const current = laundry?.relays.find(r => r.id === id);
    const nextState = current?.isOn ? 'OFF' : 'ON';
    markPendingRelayState(agent, id, nextState === 'ON');
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));
      latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r);
    }
    await ApiService.setRelayState(agent, id, nextState === 'ON' ? 'on' : 'off');
    fetchLaundries(true);
  };

  const handleBatchControl = async (ids: number[], action: 'ON' | 'OFF', agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const laundry = laundries.find(l => l.id === agent);
    const allowedIds = laundry
      ? new Set((laundry.relays || []).filter(r => !r.isHidden).map(r => r.id))
      : null;
    const targetIds = allowedIds ? ids.filter(id => allowedIds.has(id)) : ids;
    if (!targetIds.length) return;
    targetIds.forEach(id => markPendingRelayState(agent, id, action === 'ON'));
    updateLaundryRelays(agent, rels => rels.map(r => targetIds.includes(r.id) ? { ...r, isOn: action === 'ON' } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => {
        const next = prev.map(r => targetIds.includes(r.id) ? { ...r, isOn: action === 'ON' } : r);
        const merged = applyVisibility(agent, next);
        latestRelaysRef.current = merged;
        return merged;
      });
    }
    await ApiService.batchControl(agent, targetIds, action);
  };

  const handleRenameRelay = async (id: number, agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const name = (relayNameDrafts[relayDraftKey(agent, id)] || '').trim();
    if (!name) return;
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, name } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, name } : r));
    }
    await ApiService.renameRelay(agent, id, name);
    // keep latest ref in sync so exiting edit doesn't revert names
    latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, name } : r);
  };

  const handleRelayNameInput = (agentId: string, id: number, name: string) => {
    const key = relayDraftKey(agentId, id);
    setRelayNameDrafts(prev => ({ ...prev, [key]: name }));
  };

  const handleToggleVisibility = async (id: number, agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const key = relayDraftKey(agent, id);
    const currentHidden = relayVisibility[key];
    const fallbackHidden = laundries.find(l => l.id === agent)?.relays.find(r => r.id === id)?.isHidden ?? false;
    const nextHidden = currentHidden === undefined ? !fallbackHidden : !currentHidden;
    setRelayVisibility(prev => ({ ...prev, [key]: nextHidden }));
    relayVisibilityRef.current = { ...relayVisibilityRef.current, [key]: nextHidden };
    // Update relays locally; if unhidden, default to OFF
    if (agent === primaryAgentId) {
      setRelays(prev => {
        const next = prev.map(r => {
          if (r.id !== id) return r;
          return { ...r, isHidden: nextHidden, isOn: nextHidden ? r.isOn : false };
        });
        latestRelaysRef.current = next;
        return next;
      });
      // Adjust schedules
      setSchedules(prev => prev.map(s => ({ ...s, relayIds: s.relayIds.filter(rid => rid !== id) })));

      // Adjust groups: remove hidden relay; add back to all groups when unhidden
      setGroups(prev => {
        const updatedGroups = prev.map(g => {
          const hasEntry = (g.entries || []).some(e => e.agentId === agent);
          let nextEntries = (g.entries || []).map(e => {
            if (e.agentId !== agent) return e;
            const has = e.relayIds.includes(id);
            if (nextHidden && has) {
              return { ...e, relayIds: e.relayIds.filter(rid => rid !== id) };
            }
            if (!nextHidden && !has) {
              return { ...e, relayIds: [...e.relayIds, id] };
            }
            return e;
          }).filter(e => e.relayIds.length);
          if (!nextHidden && !hasEntry) {
            nextEntries = [...nextEntries, { agentId: agent, relayIds: [id] }];
          }
          return { ...g, entries: nextEntries, relayIds: nextEntries.flatMap(e => e.relayIds) };
        });
        // Persist changes to server asynchronously
        updatedGroups.forEach((g, idx) => {
          const prevGroup = prev[idx];
          if (JSON.stringify(prevGroup?.entries || []) !== JSON.stringify(g.entries || [])) {
            handleUpdateGroup(g.id, { entries: g.entries });
          }
        });
        return updatedGroups;
      });
    }

    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, isHidden: nextHidden } : r));

    const updated = await ApiService.setRelayVisibility(agent, id, nextHidden);
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r));
      latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r);
    }
    await fetchLaundries(true);
  };

  const handleIconChange = async (id: number, iconType: Relay['iconType'], agent: string = primaryAgentId) => {
    if (!iconType) return;
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, iconType } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, iconType } : r));
    }
    await ApiService.setRelayIcon(agent, id, iconType as RelayType);
  };

  const handleAddGroup = async () => {
    const selections = dedupeSelections(newGroupSelections);
    if (selections.length === 0) return;
    const onTime24 = to24h(newGroupOnTime);
    const offTime24 = to24h(newGroupOffTime);
    const entriesMap = new Map<string, number[]>();
    selections.forEach(sel => {
      const list = entriesMap.get(sel.agentId) || [];
      list.push(sel.relayId);
      entriesMap.set(sel.agentId, list);
    });
    const entries = Array.from(entriesMap.entries()).map(([agentId, relayIds]) => ({ agentId, relayIds }));
    const payload: Omit<RelayGroup, 'id'> = {
      name: newGroupName.trim(),
      entries,
      relayIds: entries.flatMap(e => e.relayIds),
      onTime: onTime24,
      offTime: offTime24,
      days: newGroupDays,
      active: Boolean(onTime24 || offTime24)
    };
    const added = await ApiService.addGroup(primaryAgentId, payload);
    setGroups(prev => [...prev, normalizeGroupPayload(added, primaryAgentId)]);
    setActiveTab(Tab.SCHEDULE);
    // reset form
    setNewGroupName('');
    setNewGroupSelections([]);
    setGroupSelectionTouched(false);
    setNewGroupOnTime('');
    setNewGroupOffTime('');
    setNewGroupDays([...DAYS_OF_WEEK]);
    setIsNewGroupVisible(false);
  };

  const handleUpdateGroup = async (groupId: string, updates: Partial<RelayGroup>) => {
    const existing = groups.find(g => g.id === groupId);
    if (!existing) return;
    const visibleMap = new Map<string, Set<number>>();
    laundries.forEach(l => {
      visibleMap.set(l.id, new Set((l.relays || []).filter(r => !r.isHidden).map(r => r.id)));
    });

    const requestedEntries = Array.isArray((updates as any)?.entries) ? (updates as any).entries as RelayGroup['entries'] : undefined;
    const fallbackRelayIds = updates.relayIds ?? existing.relayIds ?? [];

    let entries: RelayGroup['entries'] = requestedEntries && requestedEntries.length
      ? requestedEntries.map(e => ({ agentId: e.agentId, relayIds: Array.isArray(e.relayIds) ? e.relayIds.map(Number) : [] }))
      : (existing.entries && existing.entries.length
        ? existing.entries
        : [{ agentId: primaryAgentId, relayIds: fallbackRelayIds.map(Number) }]);

    entries = entries.map(e => {
      const allowed = visibleMap.get(e.agentId);
      const relayIds = allowed ? Array.from(new Set(e.relayIds.filter(id => allowed.has(id)))) : [];
      return { ...e, relayIds };
    }).filter(e => e.relayIds.length);

    const next: RelayGroup = {
      ...existing,
      ...updates,
      entries,
      relayIds: entries.flatMap(e => e.relayIds),
      onTime: updates.onTime === undefined ? existing.onTime : to24h(updates.onTime),
      offTime: updates.offTime === undefined ? existing.offTime : to24h(updates.offTime),
    };
    const saved = await ApiService.updateGroup(primaryAgentId, groupId, {
      name: next.name,
      entries: next.entries,
      relayIds: next.relayIds,
      onTime: next.onTime || null,
      offTime: next.offTime || null,
      days: next.days,
      active: next.active
    });
    setGroups(prev => prev.map(g => g.id === groupId ? normalizeGroupPayload(saved, primaryAgentId) : g));
  };

  const handleDeleteGroup = async (id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
    await ApiService.deleteGroup(primaryAgentId, id);
  };

  const handleToggleGroupPower = async (id: string, action: 'ON' | 'OFF') => {
    if (!serverOnline) return;
    const group = groups.find(g => g.id === id);
    const targetEntries = group?.entries || [];
    const desiredOn = action === 'ON';

    targetEntries.forEach(entry => {
      entry.relayIds.forEach(rid => markPendingRelayState(entry.agentId, rid, desiredOn));
      updateLaundryRelays(entry.agentId, rels => rels.map(r => entry.relayIds.includes(r.id) ? { ...r, isOn: desiredOn } : r));
      if (entry.agentId === primaryAgentId) {
        setRelays(prev => {
          const updated = prev.map(r => entry.relayIds.includes(r.id) ? { ...r, isOn: desiredOn } : r);
          latestRelaysRef.current = updated;
          return updated;
        });
      }
    });

    try {
      await ApiService.toggleGroup(primaryAgentId, id, action);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Group toggle failed', err);
    }
  };

  const updateRevenueDraft = (agentId: string, updater: (draft: RevenueDraft) => RevenueDraft) => {
    setRevenueDrafts(prev => {
      const current = prev[agentId] || buildRevenueDraft(revenueEntries[agentId] || null);
      return { ...prev, [agentId]: updater(current) };
    });
    setRevenueSaveErrors(prev => ({ ...prev, [agentId]: null }));
  };

  const addRevenueDeduction = (agentId: string) => {
    updateRevenueDraft(agentId, draft => ({
      ...draft,
      deductions: [...draft.deductions, { id: makeDeductionId(), amount: '', comment: '' }],
    }));
  };

  const removeRevenueDeduction = (agentId: string, id: string) => {
    updateRevenueDraft(agentId, draft => ({
      ...draft,
      deductions: draft.deductions.filter(item => item.id !== id),
    }));
  };

  const handleRevenueSave = async (agentId: string) => {
    const draft = revenueDrafts[agentId] || buildRevenueDraft(revenueEntries[agentId] || null);
    const coinsTotal = parseMoneyInput(draft.coinsTotal);
    const euroCoinsCount = parseCountInput(draft.euroCoinsCount);
    const billsTotal = parseMoneyInput(draft.billsTotal);
    if (coinsTotal === null) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Coins total must be a non-negative number.' }));
      return;
    }
    if (euroCoinsCount === null) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Coin count must be a non-negative integer.' }));
      return;
    }
    if (billsTotal === null) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Bills total must be a non-negative number.' }));
      return;
    }
    const { list: deductions, error } = normalizeDeductionDrafts(draft.deductions);
    if (error) {
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: error }));
      return;
    }
    setRevenueSaving(prev => ({ ...prev, [agentId]: true }));
    setRevenueSaveErrors(prev => ({ ...prev, [agentId]: null }));
    try {
      const response = await ApiService.saveRevenueEntry(agentId, {
        entryDate: revenueDate,
        coinsTotal,
        euroCoinsCount,
        billsTotal,
        deductions,
      });
      setRevenueEntries(prev => ({ ...prev, [agentId]: response.entry }));
      setRevenueAudit(prev => ({ ...prev, [agentId]: response.audit || [] }));
      setRevenueDrafts(prev => ({ ...prev, [agentId]: buildRevenueDraft(response.entry) }));
      const summary = await ApiService.getRevenueSummary(revenueDate);
      setRevenueSummary(summary);
      if (revenueView === 'daily') {
        fetchRevenueEntryDates();
      }
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue save failed', err);
      setRevenueSaveErrors(prev => ({ ...prev, [agentId]: 'Failed to save revenue entry.' }));
    } finally {
      setRevenueSaving(prev => ({ ...prev, [agentId]: false }));
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const username = newUserName.trim();
    const password = newUserPassword;
    if (!username || !password) {
      setUserCreateError('Username and password are required.');
      return;
    }
    setUserCreateError(null);
    setUserCreateLoading(true);
    try {
      await ApiService.createUser(username, password, newUserRole);
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRole('user');
      await fetchUsers();
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('User create failed', err);
      const status = (err as any)?.status;
      if (status === 409) {
        setUserCreateError('User already exists.');
      } else if (status === 400) {
        setUserCreateError('Username must be 1–64 chars with no spaces, and password is required.');
      } else {
        setUserCreateError('Failed to create user.');
      }
    } finally {
      setUserCreateLoading(false);
    }
  };

  const handleRoleSave = async (username: string) => {
    const role = userRoleDrafts[username] || 'user';
    setUserSaveErrors(prev => ({ ...prev, [username]: null }));
    setUserSaving(prev => ({ ...prev, [username]: true }));
    try {
      await ApiService.updateUserRole(username, role);
      await fetchUsers();
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Role update failed', err);
      setUserSaveErrors(prev => ({ ...prev, [username]: 'Failed to update role.' }));
    } finally {
      setUserSaving(prev => ({ ...prev, [username]: false }));
    }
  };

  const handlePasswordSave = async (username: string) => {
    const password = userPasswordDrafts[username] || '';
    if (!password) {
      setUserSaveErrors(prev => ({ ...prev, [username]: 'Password cannot be empty.' }));
      return;
    }
    setUserSaveErrors(prev => ({ ...prev, [username]: null }));
    setUserSaving(prev => ({ ...prev, [username]: true }));
    try {
      await ApiService.updateUserPassword(username, password);
      setUserPasswordDrafts(prev => ({ ...prev, [username]: '' }));
      await fetchUsers();
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Password update failed', err);
      setUserSaveErrors(prev => ({ ...prev, [username]: 'Failed to update password.' }));
    } finally {
      setUserSaving(prev => ({ ...prev, [username]: false }));
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5 text-indigo-400" />
          Control
        </h2>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={() => {
              setIsRelayEditMode(prev => {
                const next = !prev;
                if (!next) {
                  fetchLaundries(true);
                }
                return next;
              });
            }}
            data-edit-toggle="relay"
            disabled={!serverOnline}
            className={`px-3 py-2 text-xs rounded-md border transition-colors flex items-center gap-1 ${isRelayEditMode ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-slate-600 text-slate-300 hover:border-slate-500'} ${!serverOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Pencil className="w-4 h-4" />
            {isRelayEditMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      <div ref={relayEditAreaRef} className="space-y-6">
        {laundries.map((laundry, idx) => {
          const online = isLaundryOnline(laundry);
          const relaysList = laundry.relays;
          const batchRelayIds = relaysList.filter(r => !r.isHidden).map(r => r.id);
          const visibleRelays = isRelayEditMode ? relaysList : relaysList.filter(r => !r.isHidden);
          const disabled = !online;
          const mock = laundry.isMock || !online;
          return (
            <div key={laundry.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-sm font-semibold text-white">{laundry.name}</div>
                <span className={`text-xs px-2 py-1 rounded-full border ${online ? 'border-emerald-400 text-emerald-200 bg-emerald-500/10' : 'border-red-400 text-red-200 bg-red-500/10'}`}>
                  {online ? 'Online' : 'Offline'}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${mock ? 'border-amber-400 text-amber-200 bg-amber-500/10' : 'border-emerald-400 text-emerald-200 bg-emerald-500/10'}`}>
                  {mock ? <Server className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                  {mock ? 'Mock mode' : 'Hardware'}
                </span>
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => handleBatchControl(batchRelayIds, 'ON', laundry.id)}
                    disabled={!online || batchRelayIds.length === 0}
                    className="px-3 py-2 rounded-md text-xs font-semibold border border-emerald-500 text-emerald-200 bg-emerald-500/10 disabled:opacity-50"
                  >
                    ON
                  </button>
                  <button
                    onClick={() => handleBatchControl(batchRelayIds, 'OFF', laundry.id)}
                    disabled={!online || batchRelayIds.length === 0}
                    className="px-3 py-2 rounded-md text-xs font-semibold border border-red-500 text-red-200 bg-red-500/10 disabled:opacity-50"
                  >
                    OFF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {visibleRelays.length === 0 && (
                  <div className="text-sm text-slate-500 bg-slate-900/40 border border-slate-700 rounded-lg p-3 col-span-2">
                    No relays reported for this agent.
                  </div>
                )}
                {visibleRelays.map(relay => (
                  <RelayCard
                    key={`${laundry.id}-${relay.id}`}
                    relay={relay}
                    onToggle={() => handleToggleRelay(relay.id, laundry.id)}
                    isEditing={isRelayEditMode}
                    nameValue={relayNameDrafts[relayDraftKey(laundry.id, relay.id)] ?? relay.name}
                    onNameChange={(rid, name) => handleRelayNameInput(laundry.id, rid, name)}
                    onNameSave={(rid) => handleRenameRelay(rid, laundry.id)}
                    isHidden={relay.isHidden}
                    onToggleVisibility={(rid) => handleToggleVisibility(rid, laundry.id)}
                    onIconChange={(rid, icon) => handleIconChange(rid, icon, laundry.id)}
                    isDisabled={disabled}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderScheduler = () => {
    const visibleByLaundry = laundries.map(l => ({
      ...l,
      visibleRelays: (l.relays || []).filter(r => !r.isHidden),
    }));
    const selectionSet = new Set(newGroupSelections.map(sel => selectionKey(sel.agentId, sel.relayId)));
    return (
      <div className="space-y-6 max-w-full overflow-hidden">
          <div className="space-y-3 max-w-full overflow-hidden">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Groups & Schedules</h2>
            </div>
            <button
              onClick={() => {
                setIsNewGroupVisible(v => !v);
                if (!isNewGroupVisible) {
                  setNewGroupName('New Group');
                  setNewGroupSelections([]);
                  setGroupSelectionTouched(false);
                  setNewGroupOnTime('');
                  setNewGroupOffTime('');
                  setNewGroupDays([...DAYS_OF_WEEK]);
                }
              }}
              disabled={controlsDisabled}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isNewGroupVisible ? 'Close' : 'Add Group'}
            </button>
          </div>
          {isNewGroupVisible && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4 max-w-full w-full box-border">
            <div className="grid gap-3">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                disabled={controlsDisabled}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Group name"
              />
              <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-slate-300">Laundries</p>
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={() => {
                          setGroupSelectionTouched(true);
                          const allVisible = visibleByLaundry.flatMap(l => l.visibleRelays.map(r => ({ agentId: l.id, relayId: r.id })));
                          setNewGroupSelections(dedupeSelections(allVisible));
                        }}
                        disabled={controlsDisabled}
                        className="px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                      >
                        Select all
                      </button>
                      <button
                      onClick={() => setNewGroupSelections([])}
                      disabled={controlsDisabled}
                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      Deselect all
                    </button>
                    </div>
                </div>
                <div className="space-y-3">
                  {visibleByLaundry.map(l => {
                    const online = isLaundryOnline(l);
                    return (
                      <div key={`laundry-select-${l.id}`} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-200">{l.name}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${online ? 'border-emerald-500 text-emerald-200 bg-emerald-500/10' : 'border-slate-600 text-slate-400'}`}>
                            {online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {l.visibleRelays.length === 0 && <span className="text-xs text-slate-500">No relays</span>}
                          {l.visibleRelays.map(relay => {
                            const key = selectionKey(l.id, relay.id);
                            const selected = selectionSet.has(key);
                            return (
                              <button
                                key={`${l.id}-relay-${relay.id}`}
                                onClick={() => {
                                  setGroupSelectionTouched(true);
                                  setNewGroupSelections(prev => {
                                    const exists = prev.some(s => selectionKey(s.agentId, s.relayId) === key);
                                    const next = exists
                                      ? prev.filter(s => selectionKey(s.agentId, s.relayId) !== key)
                                      : [...prev, { agentId: l.id, relayId: relay.id }];
                                    return dedupeSelections(next);
                                  });
                                }}
                                disabled={controlsDisabled}
                                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${
                                  selected ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/40 text-slate-300 border-slate-700 hover:border-slate-600'
                                } ${controlsDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                <span className={`w-2 h-2 rounded-full ${relay.isOn ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-slate-500'}`}></span>
                                {relay.name}
                                <span className="text-[10px] text-slate-400">#{relay.id}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-full">
                <div className="min-w-0 w-full overflow-hidden">
                  <label className="text-sm text-slate-300 block mb-1">On time (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="^([01]?\\d|2[0-3]):[0-5]\\d$"
                    maxLength={5}
                    placeholder="HH:MM"
                    value={newGroupOnTime}
                    onChange={(e) => setNewGroupOnTime(normalizeTimeInput(e.target.value))}
                    onBlur={(e) => setNewGroupOnTime(to24h(e.target.value) || '')}
                    disabled={controlsDisabled}
                    className="time-input w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    style={{ color: '#dbeafe', WebkitTextFillColor: '#dbeafe' }}
                  />
                </div>
                <div className="min-w-0 w-full overflow-hidden">
                  <label className="text-sm text-slate-300 block mb-1">Off time (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="^([01]?\\d|2[0-3]):[0-5]\\d$"
                    maxLength={5}
                    placeholder="HH:MM"
                    value={newGroupOffTime}
                    onChange={(e) => setNewGroupOffTime(normalizeTimeInput(e.target.value))}
                    onBlur={(e) => setNewGroupOffTime(to24h(e.target.value) || '')}
                    disabled={controlsDisabled}
                    className="time-input w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    style={{ color: '#dbeafe', WebkitTextFillColor: '#dbeafe' }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-300">Days</p>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => setNewGroupDays([...DAYS_OF_WEEK])}
                      disabled={controlsDisabled}
                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setNewGroupDays([])}
                      disabled={controlsDisabled}
                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day}
                      onClick={() => setNewGroupDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                      disabled={controlsDisabled}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${newGroupDays.includes(day) ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/40 text-slate-300 border-slate-700 hover:border-slate-600'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleAddGroup}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                disabled={!newGroupName.trim() || newGroupSelections.length === 0 || controlsDisabled}
              >
                Save Group
              </button>
            </div>
          </div>
          )}
        </div>

        <div className="space-y-3">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
              No groups yet.
            </div>
          ) : (
            groups.map(group => {
              const selectedSet = new Set(
                (group.entries || []).flatMap(e => (e.relayIds || []).map(id => selectionKey(e.agentId, id)))
              );
              return (
                <div
                  key={group.id}
                  ref={editingGroupId === group.id ? groupEditAreaRef : null}
                  className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3"
                >
                  <div className="flex justify-between gap-3 items-start">
                    {editingGroupId === group.id ? (
                      <input
                        value={group.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: val } : g));
                          handleUpdateGroup(group.id, { name: val });
                        }}
                        className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    ) : (
                      <span className="flex-1 text-sm font-semibold text-white">{group.name}</span>
                    )}
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handleToggleGroupPower(group.id, 'ON')}
                        disabled={controlsDisabled}
                        className="px-3 py-2 rounded-md text-xs font-semibold border border-emerald-500 text-emerald-200 bg-emerald-500/10"
                      >
                        ON
                      </button>
                      <button
                        onClick={() => handleToggleGroupPower(group.id, 'OFF')}
                        disabled={controlsDisabled}
                        className="px-3 py-2 rounded-md text-xs font-semibold border border-red-500 text-red-200 bg-red-500/10"
                      >
                        OFF
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {visibleByLaundry.map(l => {
                      const relaysToShow = editingGroupId === group.id
                        ? l.visibleRelays
                        : l.visibleRelays.filter(relay => selectedSet.has(selectionKey(l.id, relay.id)));
                      if (!relaysToShow.length && editingGroupId !== group.id) return null;
                      return (
                        <div key={`group-${group.id}-${l.id}`} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                          <div className="text-xs text-slate-300 mb-2">{l.name}</div>
                          <div className="flex gap-2 flex-wrap">
                            {relaysToShow.length === 0 && <span className="text-xs text-slate-500">No relays</span>}
                            {relaysToShow.map(relay => {
                              const key = selectionKey(l.id, relay.id);
                              const selected = selectedSet.has(key);
                              return (
                                <button
                                  key={key}
                                  onClick={() => {
                                    if (editingGroupId !== group.id) return;
                                    setGroups(prev => prev.map(g => {
                                      if (g.id !== group.id) return g;
                                      const entriesMap = new Map<string, number[]>();
                                      const baseEntries = g.entries && g.entries.length ? g.entries : [{ agentId: l.id, relayIds: [] }];
                                      baseEntries.forEach(e => entriesMap.set(e.agentId, [...e.relayIds]));
                                      const list = entriesMap.get(l.id) || [];
                                      const exists = list.includes(relay.id);
                                      const nextList = exists ? list.filter(r => r !== relay.id) : [...list, relay.id];
                                      entriesMap.set(l.id, nextList);
                                      const entriesArr = Array.from(entriesMap.entries()).map(([agentId, relayIds]) => ({
                                        agentId,
                                        relayIds: relayIds.filter(Boolean),
                                      })).filter(e => e.relayIds.length);
                                      const nextGroup = { ...g, entries: entriesArr, relayIds: entriesArr.flatMap(e => e.relayIds) };
                                      handleUpdateGroup(group.id, { entries: entriesArr });
                                      return nextGroup;
                                    }));
                                  }}
                                  disabled={controlsDisabled || editingGroupId !== group.id}
                                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 ${
                                    selected ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/40 text-slate-300 border-slate-700 hover:border-slate-600'
                                  } ${editingGroupId === group.id ? '' : 'opacity-60 cursor-not-allowed'}`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={relay.isOn ? { backgroundColor: '#34d399', boxShadow: '0 0 8px rgba(52, 211, 153, 0.7)' } : { backgroundColor: '#64748b' }}
                                  />
                                  {relay.name}
                                  <span className="text-[10px] text-slate-400">#{relay.id}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-full">
                    <div className="min-w-0 w-full overflow-hidden">
                      <label className="text-sm text-slate-300 block mb-1">On time</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="^([01]?\\d|2[0-3]):[0-5]\\d$"
                        maxLength={5}
                        placeholder="HH:MM"
                        value={group.onTime || ''}
                        onChange={(e) => {
                          if (editingGroupId !== group.id) return;
                          const next = normalizeTimeInput(e.target.value);
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, onTime: next } : g));
                        }}
                        onBlur={(e) => {
                          if (editingGroupId !== group.id) return;
                          const val = to24h(e.target.value);
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, onTime: val || '' } : g));
                          handleUpdateGroup(group.id, { onTime: val || null });
                        }}
                        disabled={editingGroupId !== group.id || controlsDisabled}
                        className={`time-input w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100 placeholder-slate-300 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-200 disabled:text-slate-100 disabled:placeholder-slate-200 disabled:opacity-100 transition-all ${editingGroupId === group.id ? '' : 'opacity-60 cursor-not-allowed'}`}
                        style={{ color: '#dbeafe', WebkitTextFillColor: '#dbeafe' }}
                      />
                    </div>
                    <div className="min-w-0 w-full overflow-hidden">
                      <label className="text-sm text-slate-300 block mb-1">Off time</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="^([01]?\\d|2[0-3]):[0-5]\\d$"
                        maxLength={5}
                        placeholder="HH:MM"
                        value={group.offTime || ''}
                        onChange={(e) => {
                          if (editingGroupId !== group.id) return;
                          const next = normalizeTimeInput(e.target.value);
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, offTime: next } : g));
                        }}
                        onBlur={(e) => {
                          if (editingGroupId !== group.id) return;
                          const val = to24h(e.target.value);
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, offTime: val || '' } : g));
                          handleUpdateGroup(group.id, { offTime: val || null });
                        }}
                        disabled={editingGroupId !== group.id || controlsDisabled}
                        className={`time-input w-full max-w-full min-w-0 box-border bg-slate-900/50 border border-slate-700 rounded-xl px-3 py-3 text-sm text-slate-100 placeholder-slate-300 focus:outline-none focus:border-indigo-200 focus:ring-1 focus:ring-indigo-200 disabled:text-slate-100 disabled:placeholder-slate-200 disabled:opacity-100 transition-all ${editingGroupId === group.id ? '' : 'opacity-60 cursor-not-allowed'}`}
                        style={{ color: '#dbeafe', WebkitTextFillColor: '#dbeafe' }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2 flex-wrap">
                      {DAYS_OF_WEEK.map(day => {
                        const active = group.days?.includes(day);
                        return (
                          <button
                            key={day}
                            onClick={() => {
                              if (editingGroupId !== group.id) return;
                          const nextDays = active ? group.days.filter(d => d !== day) : [...(group.days || []), day];
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, days: nextDays } : g));
                          handleUpdateGroup(group.id, { days: nextDays });
                        }}
                            disabled={editingGroupId !== group.id || controlsDisabled}
                            className={`text-[10px] uppercase px-3 py-1 rounded border ${
                              active ? 'text-indigo-200 bg-indigo-500/20 border-indigo-500/50' : 'text-slate-500 bg-slate-900/40 border-slate-700'
                            } ${editingGroupId === group.id ? '' : 'opacity-60 cursor-not-allowed'}`}
                          >
                            {day.slice(0, 1)}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 items-center">
                      <label className="text-xs text-slate-300 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={group.active}
                          onChange={(e) => handleUpdateGroup(group.id, { active: e.target.checked })}
                          disabled={controlsDisabled}
                        />
                        Schedule active
                      </label>
                      <div className="flex gap-2">
                    <button
                      onClick={() => setEditingGroupId(editingGroupId === group.id ? null : group.id)}
                      data-edit-toggle="group"
                      disabled={controlsDisabled}
                      className={`p-2 rounded-lg ${editingGroupId === group.id ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
                      aria-label="Edit group"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      disabled={controlsDisabled}
                      className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
    </div>
    );
  };

  const renderRevenueCalendar = () => {
    const range = getMonthRange(revenueDate);
    if (!range) return null;
    const { year, month, daysInMonth } = range;
    const firstDay = new Date(year, month - 1, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const entryDates = new Set(revenueEntryDates);
    const monthLabel = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return (
      <div className="bg-slate-900/40 border border-slate-700 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRevenueDate(shiftDateByMonths(revenueDate, -1))}
            className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
            aria-label="Previous month"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <div className="text-sm font-semibold text-slate-200">{monthLabel}</div>
          <button
            type="button"
            onClick={() => setRevenueDate(shiftDateByMonths(revenueDate, 1))}
            className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
            aria-label="Next month"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] uppercase text-slate-500">
          {DAYS_OF_WEEK.map(day => (
            <div key={`weekday-${day}`} className="text-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: totalCells }, (_, idx) => {
            const day = idx - startOffset + 1;
            if (day < 1 || day > daysInMonth) {
              return <div key={`empty-${idx}`} className="h-9" />;
            }
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = dateStr === revenueDate;
            const hasEntry = entryDates.has(dateStr);
            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setRevenueDate(dateStr)}
                className={`h-9 rounded-md text-xs flex flex-col items-center justify-center border ${
                  isSelected
                    ? 'border-indigo-400/80 bg-indigo-500/20 text-white'
                    : 'border-transparent text-slate-200 hover:bg-slate-800/60'
                }`}
                aria-label={`Select ${dateStr}`}
              >
                <span>{day}</span>
                {hasEntry && <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-slate-500 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Entries recorded
        </div>
      </div>
    );
  };

  const renderRevenueDaily = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-xs text-slate-400">Entry date</span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setRevenueDate(shiftDateByDays(revenueDate, -1))}
              className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={revenueDate}
              onChange={(e) => setRevenueDate(e.target.value)}
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full sm:w-auto"
            />
            <button
              type="button"
              onClick={() => setRevenueDate(shiftDateByDays(revenueDate, 1))}
              className="p-2 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsRevenueCalendarOpen(prev => !prev)}
          className="flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white sm:justify-start"
          aria-expanded={isRevenueCalendarOpen}
        >
          <span className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            Calendar
          </span>
          {isRevenueCalendarOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isRevenueCalendarOpen && renderRevenueCalendar()}

      {revenueError && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-3 py-2 rounded-lg text-sm">
          {revenueError}
        </div>
      )}

      {revenueSummary && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Week (Mon–Sun)</div>
            <div className="text-2xl font-semibold text-white mt-1">€{formatMoney(revenueSummary.week.overall)}</div>
            <div className="text-xs text-slate-500 mt-1">{revenueSummary.week.startDate} → {revenueSummary.week.endDate}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">Month</div>
            <div className="text-2xl font-semibold text-white mt-1">€{formatMoney(revenueSummary.month.overall)}</div>
            <div className="text-xs text-slate-500 mt-1">{revenueSummary.month.startDate} → {revenueSummary.month.endDate}</div>
          </div>
        </div>
      )}

      {revenueLoading && (
        <div className="text-sm text-slate-400">Loading revenue data...</div>
      )}

      {!revenueLoading && laundries.map(laundry => {
        const entry = revenueEntries[laundry.id] || null;
        const draft = revenueDrafts[laundry.id] || buildRevenueDraft(entry);
        const entryAudit = revenueAudit[laundry.id] || [];
        const coinsAudit = getLatestAudit(laundry.id, 'coinsTotal');
        const countAudit = getLatestAudit(laundry.id, 'euroCoinsCount');
        const billsAudit = getLatestAudit(laundry.id, 'billsTotal');
        const deductionsAudit = getLatestAudit(laundry.id, 'deductions');
        const prevDeductionSummary = getDeductionSummary(deductionsAudit?.oldValue ?? null);
        const weekTotal = revenueSummary?.week.totalsByAgent?.[laundry.id] ?? 0;
        const monthTotal = revenueSummary?.month.totalsByAgent?.[laundry.id] ?? 0;
        const saveError = revenueSaveErrors[laundry.id];
        const saving = Boolean(revenueSaving[laundry.id]);

        const fieldClass = (changed: boolean) => (
          `w-full bg-slate-900/60 border rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
            changed ? 'border-amber-400/70 bg-amber-500/10' : 'border-slate-700'
          }`
        );

        return (
          <div key={laundry.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{laundry.name}</div>
                <div className="text-xs text-slate-500">Week: €{formatMoney(weekTotal)} · Month: €{formatMoney(monthTotal)}</div>
              </div>
              <div className="flex items-center gap-2">
                {entry?.hasEdits && (
                  <span className="text-xs px-2 py-1 rounded-full border border-amber-400 text-amber-200 bg-amber-500/10">
                    Edited
                  </span>
                )}
                <span className="text-xs px-2 py-1 rounded-full border border-slate-600 text-slate-300 bg-slate-900/40">
                  {entry ? 'Entry loaded' : 'No entry yet'}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Coins total (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.coinsTotal}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraft(laundry.id, d => ({ ...d, coinsTotal: nextValue }));
                  }}
                  className={fieldClass(Boolean(coinsAudit))}
                  placeholder="0.00"
                />
                {coinsAudit && (
                  <div className="text-[11px] text-amber-300">
                    Prev: €{formatMoney(Number(coinsAudit.oldValue))} · {coinsAudit.user} · {formatTimestamp(coinsAudit.createdAt)}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Coins in €1 (count)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.euroCoinsCount}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraft(laundry.id, d => ({ ...d, euroCoinsCount: nextValue }));
                  }}
                  className={fieldClass(Boolean(countAudit))}
                  placeholder="0"
                />
                {countAudit && (
                  <div className="text-[11px] text-amber-300">
                    Prev: {countAudit.oldValue} · {countAudit.user} · {formatTimestamp(countAudit.createdAt)}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Bills total (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.billsTotal}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (!isRevenueNumericInput(nextValue)) return;
                    updateRevenueDraft(laundry.id, d => ({ ...d, billsTotal: nextValue }));
                  }}
                  className={fieldClass(Boolean(billsAudit))}
                  placeholder="0.00"
                />
                {billsAudit && (
                  <div className="text-[11px] text-amber-300">
                    Prev: €{formatMoney(Number(billsAudit.oldValue))} · {billsAudit.user} · {formatTimestamp(billsAudit.createdAt)}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-300">Deductions (comment required)</div>
                <button
                  onClick={() => addRevenueDeduction(laundry.id)}
                  className="text-xs px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                >
                  Add deduction
                </button>
              </div>
              {deductionsAudit && prevDeductionSummary && (
                <div className="text-[11px] text-amber-300">
                  Prev: €{formatMoney(prevDeductionSummary.total)} across {prevDeductionSummary.count} items · {deductionsAudit.user} · {formatTimestamp(deductionsAudit.createdAt)}
                </div>
              )}
              {draft.deductions.length === 0 && (
                <div className="text-xs text-slate-500">No deductions yet.</div>
              )}
              {draft.deductions.map(item => (
                <div key={item.id} className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={item.amount}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      if (!isRevenueNumericInput(nextValue)) return;
                      updateRevenueDraft(laundry.id, d => ({
                        ...d,
                        deductions: d.deductions.map(row => row.id === item.id ? { ...row, amount: nextValue } : row),
                      }));
                    }}
                    className="flex-1 min-w-0 w-full sm:w-auto sm:min-w-[120px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                  <input
                    type="text"
                    value={item.comment}
                    onChange={(e) => updateRevenueDraft(laundry.id, d => ({
                      ...d,
                      deductions: d.deductions.map(row => row.id === item.id ? { ...row, comment: e.target.value } : row),
                    }))}
                    className="flex-[2] min-w-0 w-full sm:w-auto sm:min-w-[200px] bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Reason"
                  />
                  <button
                    onClick={() => removeRevenueDeduction(laundry.id, item.id)}
                    className="text-xs px-3 py-2 w-full sm:w-auto rounded-md border border-red-500/40 text-red-300 hover:text-red-200 hover:border-red-400 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            {saveError && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {saveError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {entry
                  ? `Updated ${formatTimestamp(entry.updatedAt)} by ${entry.updatedBy || 'unknown'}`
                  : 'No entry recorded for this date.'}
              </div>
              <button
                onClick={() => handleRevenueSave(laundry.id)}
                disabled={saving}
                className="px-4 py-2 rounded-md text-xs font-semibold border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save entry'}
              </button>
            </div>

            {entryAudit.length > 0 && (
              <div className="text-xs text-slate-500 border-t border-slate-700 pt-3 space-y-1">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Audit log</div>
                {entryAudit.filter(item => item.oldValue !== null).slice(0, 6).map(item => (
                  <div key={`${item.id}-${item.createdAt}`} className="flex flex-wrap justify-between gap-2">
                    <span>{item.field}: {item.oldValue} → {item.newValue}</span>
                    <span>{item.user} · {formatTimestamp(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderRevenueAll = () => {
    const laundryNameMap = new Map(laundries.map(l => [l.id, l.name]));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400">{revenueAllEntries.length} entries</div>
          <button
            onClick={handleExportRevenueCsv}
            disabled={revenueAllLoading || revenueAllEntries.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {revenueAllError && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-3 py-2 rounded-lg text-sm">
            {revenueAllError}
          </div>
        )}

        {revenueAllLoading && (
          <div className="text-sm text-slate-400">Loading revenue entries...</div>
        )}

        {!revenueAllLoading && revenueAllEntries.length === 0 && (
          <div className="text-sm text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700 p-4">
            No entries yet.
          </div>
        )}

        {!revenueAllLoading && revenueAllEntries.length > 0 && (
          <>
            <div className="space-y-3 md:hidden">
              {revenueAllEntries.map(entry => (
                <div key={`${entry.agentId}-${entry.entryDate}`} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{entry.entryDate}</div>
                    <div className="text-[11px] text-slate-400">{laundryNameMap.get(entry.agentId) || entry.agentId}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mt-2">
                    <div>Coins: €{formatMoney(entry.coinsTotal)}</div>
                    <div>€1 count: {entry.euroCoinsCount}</div>
                    <div>Bills: €{formatMoney(entry.billsTotal)}</div>
                    <div>Deductions: €{formatMoney(entry.deductionsTotal)}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-2">
                    Updated {formatTimestamp(entry.updatedAt)} · {entry.updatedBy || 'unknown'}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto border border-slate-700 rounded-xl">
              <table className="min-w-[900px] w-full text-xs text-slate-200">
                <thead className="bg-slate-900/60 text-slate-400 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Laundry</th>
                    <th className="px-3 py-2 text-right">Coins (€)</th>
                    <th className="px-3 py-2 text-right">€1 count</th>
                    <th className="px-3 py-2 text-right">Bills (€)</th>
                    <th className="px-3 py-2 text-right">Deductions (€)</th>
                    <th className="px-3 py-2 text-left">Updated by</th>
                    <th className="px-3 py-2 text-left">Updated at</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueAllEntries.map(entry => (
                    <tr key={`${entry.agentId}-${entry.entryDate}`} className="border-t border-slate-700">
                      <td className="px-3 py-2">{entry.entryDate}</td>
                      <td className="px-3 py-2">{laundryNameMap.get(entry.agentId) || entry.agentId}</td>
                      <td className="px-3 py-2 text-right">€{formatMoney(entry.coinsTotal)}</td>
                      <td className="px-3 py-2 text-right">{entry.euroCoinsCount}</td>
                      <td className="px-3 py-2 text-right">€{formatMoney(entry.billsTotal)}</td>
                      <td className="px-3 py-2 text-right">€{formatMoney(entry.deductionsTotal)}</td>
                      <td className="px-3 py-2">{entry.updatedBy || 'unknown'}</td>
                      <td className="px-3 py-2">{formatTimestamp(entry.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRevenue = () => {
    if (authUser?.role !== 'admin') {
      return (
        <div className="text-center py-16 text-slate-500">
          Revenue tracking is available to admin users only.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Revenue
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 p-1 w-full sm:w-auto justify-between">
              <button
                onClick={() => setRevenueView('daily')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex-1 sm:flex-none ${
                  revenueView === 'daily' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setRevenueView('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex-1 sm:flex-none ${
                  revenueView === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All entries
              </button>
            </div>
          </div>
        </div>
        {revenueView === 'daily' ? renderRevenueDaily() : renderRevenueAll()}
      </div>
    );
  };

  const renderSystem = () => {
    if (authUser?.role !== 'admin') {
      return (
        <div className="text-center py-20 text-slate-500">
          <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg text-slate-300 font-medium mb-2">System</h3>
          <p className="text-sm max-w-sm mx-auto">Admin access is required to manage users.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-300" />
            <h2 className="text-xl font-bold text-white">System</h2>
          </div>
          <button
            onClick={fetchUsers}
            disabled={usersLoading}
            className="px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            {usersLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">User Management</h3>
            <p className="text-xs text-slate-400">Create users, set passwords, and manage roles.</p>
          </div>

          {usersError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {usersError}
            </div>
          )}

          {usersLoading && (
            <div className="text-sm text-slate-400">Loading users...</div>
          )}

          {!usersLoading && (
            <div className="space-y-3">
              {users.length === 0 && (
                <div className="text-sm text-slate-500 bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                  No users yet.
                </div>
              )}
              {users.map(user => {
                const saving = Boolean(userSaving[user.username]);
                const roleValue = userRoleDrafts[user.username] ?? user.role;
                const passwordValue = userPasswordDrafts[user.username] ?? '';
                return (
                  <div key={user.username} className="bg-slate-900/40 border border-slate-700 rounded-lg p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-100 font-medium">{user.username}</div>
                        <div className="text-[11px] text-slate-500">Last login: {formatLastLogin(user.lastLoginAt)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={roleValue}
                          onChange={(e) => {
                            const value = e.target.value === 'admin' ? 'admin' : 'user';
                            setUserRoleDrafts(prev => ({ ...prev, [user.username]: value }));
                          }}
                          className="bg-slate-900/60 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="admin">admin</option>
                          <option value="user">user</option>
                        </select>
                        <button
                          onClick={() => handleRoleSave(user.username)}
                          disabled={saving}
                          className="px-2 py-1 text-xs rounded-md border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Update role'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2">
                      <input
                        type="password"
                        value={passwordValue}
                        onChange={(e) => setUserPasswordDrafts(prev => ({ ...prev, [user.username]: e.target.value }))}
                        placeholder="New password"
                        className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        onClick={() => handlePasswordSave(user.username)}
                        disabled={saving}
                        className="px-3 py-2 text-xs rounded-md border border-amber-500 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Set password'}
                      </button>
                    </div>

                    {userSaveErrors[user.username] && (
                      <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2 py-1">
                        {userSaveErrors[user.username]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <form onSubmit={handleCreateUser} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-300" />
            <h3 className="text-base font-semibold text-white">Add user</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="Username"
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Password"
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value === 'admin' ? 'admin' : 'user')}
              className="bg-slate-900/60 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>

          {userCreateError && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              {userCreateError}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={userCreateLoading}
              className="px-4 py-2 rounded-md text-xs font-semibold border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              {userCreateLoading ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-500">Checking session...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-sm bg-slate-800/70 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col items-center text-center gap-4">
            <img
              src={BRAND_LOGO_URL}
              alt="WashControl"
              className="w-full max-w-[240px] sm:max-w-[320px] lg:max-w-[360px] h-auto"
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Secure Access</p>
              <h2 className="text-lg font-semibold text-white">LaundroPi Control</h2>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleLoginSubmit}>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Username</label>
              <input
                value={authLogin}
                onChange={(e) => setAuthLogin(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Password</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
            {authError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                {authError}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading && laundries.length === 0) {
    console.log('[LaundroPi] render branch: loading screen', { isLoading, relaysLen: relays.length, activeTab });
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-500">Loading LaundroPi...</div>;
  }

  console.log('[LaundroPi] render branch: main UI', { isLoading, relaysLen: relays.length, activeTab, schedulesLen: schedules.length });
  return (
    <div className="min-h-screen pb-24 overflow-x-hidden">
      {/* Header */}
      <header className="bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-full sm:max-w-3xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex flex-col gap-3 sm:grid sm:grid-cols-[auto,minmax(0,1fr),auto] sm:items-start sm:gap-x-5 sm:gap-y-2">
            <div className="flex items-center gap-3 min-w-0 sm:row-span-2 sm:self-start">
              <img
                src={BRAND_LOGO_URL}
                alt="WashControl"
                className="h-12 sm:h-16 lg:h-20 w-auto shrink-0"
              />
              <span className="sr-only">WashControl</span>
            </div>
            <div className="flex items-center gap-4 sm:gap-5 justify-start sm:justify-end w-full sm:w-auto sm:row-start-1 sm:col-start-3 sm:justify-self-end">
              <div className="flex items-center gap-4">
                {authUser && (
                  <div className="text-left sm:text-right leading-tight">
                    <div className="text-xs text-slate-300">{authUser.username}</div>
                    <div className="text-[10px] uppercase text-slate-500">{authUser.role}</div>
                  </div>
                )}
                <div className="text-left sm:text-right leading-tight">
                  <div className="text-lg font-mono text-white font-medium">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full sm:contents">
              {laundries.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto min-w-0 flex-1 sm:row-start-2 sm:col-start-2">
                  {laundries.map(laundry => {
                    const online = isLaundryOnline(laundry);
                    return (
                      <span
                        key={`header-status-${laundry.id}`}
                        className={`inline-flex flex-col gap-1 px-3 py-1.5 rounded-xl border text-[11px] font-semibold ${
                          online
                            ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/10'
                            : 'border-red-400/60 text-red-200 bg-red-500/10'
                        }`}
                      >
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          <span className="max-w-[140px] truncate">{laundry.name}</span>
                        </span>
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-[10px] uppercase tracking-wide opacity-70">
                            {online ? 'Online' : 'Offline'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide border ${
                              laundry.isMock
                                ? 'border-amber-400/60 text-amber-200 bg-amber-500/10'
                                : 'border-sky-400/60 text-sky-200 bg-sky-500/10'
                            }`}
                          >
                            {laundry.isMock ? 'Mock' : 'Pi'}
                          </span>
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
              <button
                onClick={handleLogout}
                className="ml-auto shrink-0 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold border border-slate-700 rounded-md text-slate-300 hover:text-white hover:border-indigo-500 transition-colors sm:row-start-2 sm:col-start-3 sm:ml-0 sm:justify-self-end"
              >
                <Lock className="w-4 h-4" />
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-full sm:max-w-3xl w-full mx-auto px-3 sm:px-4 py-6 overflow-hidden box-border">
        {offlineMessages.length > 0 && (
          <div className="mb-4 space-y-2">
            {offlineMessages.map(message => (
              <div
                key={message.key}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  message.tone === 'server'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    : 'bg-red-500/10 border-red-500/40 text-red-200'
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>
        )}
        {activeTab === Tab.DASHBOARD && renderDashboard()}
        {activeTab === Tab.SCHEDULE && renderScheduler()}
        {activeTab === Tab.REVENUE && renderRevenue()}
        {activeTab === Tab.SETTINGS && renderSystem()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe">
        <div className="max-w-full sm:max-w-3xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          {authUser?.role === 'admin' && (
            <button 
              onClick={() => setActiveTab(Tab.REVENUE)}
              className={`flex flex-col items-center gap-1 ${activeTab === Tab.REVENUE ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Coins className="w-6 h-6" />
              <span className="text-[10px] font-medium">Revenue</span>
            </button>
          )}

          <button 
            onClick={() => setActiveTab(Tab.DASHBOARD)}
            className={`flex flex-col items-center gap-1 ${activeTab === Tab.DASHBOARD ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-[10px] font-medium">Control</span>
          </button>
          
          <button 
            onClick={() => setActiveTab(Tab.SCHEDULE)}
            className={`flex flex-col items-center gap-1 ${activeTab === Tab.SCHEDULE ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <CalendarClock className="w-6 h-6" />
            <span className="text-[10px] font-medium">Groups</span>
          </button>

          <button 
            onClick={() => setActiveTab(Tab.SETTINGS)}
            className={`flex flex-col items-center gap-1 ${activeTab === Tab.SETTINGS ? 'text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-medium">System</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default App;
// Test helpers
export const __timeHelpers = { to24h, normalizeTimeInput };
export const __revenueHelpers = { isRevenueNumericInput };
