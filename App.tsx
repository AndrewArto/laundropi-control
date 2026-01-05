import React, { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarClock, Settings, Trash2, Cpu, Server, Pencil, Plus, Lock } from 'lucide-react';
import RelayCard from './components/RelayCard';
import { Relay, Schedule, RelayType, RelayGroup } from './types';
import { ApiService } from './services/api';
import { DAYS_OF_WEEK } from './constants';

enum Tab {
  DASHBOARD = 'DASHBOARD',
  SCHEDULE = 'SCHEDULE',
  SETTINGS = 'SETTINGS'
}

const AGENT_STALE_MS = 8_000;
const PENDING_RELAY_TTL_MS = 5_000;
const DEFAULT_AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID ?? 'dev-agent';
const DEFAULT_AGENT_SECRET = (import.meta as any).env?.VITE_AGENT_SECRET ?? 'secret';
const IS_TEST_ENV = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || false;
const BRAND_LOGO_URL = '/washcontrol-logo.png';

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
  const primaryAgentId = agentId || laundries[0]?.id || DEFAULT_AGENT_ID;
  const [isAddingLaundry, setIsAddingLaundry] = useState(false);
  const [newLaundryInput, setNewLaundryInput] = useState('');
  const [newLaundrySecret, setNewLaundrySecret] = useState(DEFAULT_AGENT_SECRET);
  const pendingRelayStatesRef = React.useRef<Map<string, { state: boolean; updatedAt: number }>>(new Map());

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
  };

  const handleAuthFailure = (err: unknown) => {
    const status = (err as any)?.status;
    if (status !== 401) return false;
    setAuthError('Session expired. Please sign in again.');
    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    setAuthUser(null);
    setAuthPassword('');
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
    relayVisibilityRef.current = relayVisibility;
  }, [relayVisibility]);

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
      setAuthUser(login.user || { username: authLogin.trim(), role: 'user' });
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
            disabled={!serverOnline}
            className={`px-3 py-2 text-xs rounded-md border transition-colors flex items-center gap-1 ${isRelayEditMode ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-slate-600 text-slate-300 hover:border-slate-500'} ${!serverOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Pencil className="w-4 h-4" />
            {isRelayEditMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {laundries.map((laundry, idx) => {
        const fresh = laundry.lastHeartbeat ? (Date.now() - laundry.lastHeartbeat) < AGENT_STALE_MS : false;
        const online = serverOnline && laundry.isOnline && fresh;
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
                    const fresh = l.lastHeartbeat ? (Date.now() - l.lastHeartbeat) < AGENT_STALE_MS : false;
                    const online = serverOnline && l.isOnline && fresh;
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
                <div key={group.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 space-y-3">
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

  if (!isAuthReady) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-500">Checking session...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-sm bg-slate-800/70 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <img
              src={BRAND_LOGO_URL}
              alt="WashControl"
              className="h-48 w-auto max-w-none"
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
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <img
                src={BRAND_LOGO_URL}
                alt="WashControl"
                className="h-40 w-auto max-w-none"
              />
              <span className="sr-only">WashControl</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {laundries.map(l => {
                const fresh = l.lastHeartbeat ? (Date.now() - l.lastHeartbeat) < AGENT_STALE_MS : false;
                const online = l.isOnline && fresh;
                const mock = l.isMock || !online;
                return (
                  <div key={l.id} className="flex items-center gap-2 px-2 py-1 rounded-md border border-slate-700 bg-slate-900/50">
                    <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}></span>
                    <div className="flex flex-col leading-tight">
                      <p className="text-xs text-slate-300 flex items-center gap-1">
                        {mock ? <Server className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                        {l.name} {online ? 'online' : 'offline'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {mock ? 'Mock mode (no GPIO)' : 'Hardware connected'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
          <div className="flex items-center gap-3">
                {authUser && (
                  <div className="text-right">
                    <div className="text-xs text-slate-300">{authUser.username}</div>
                    <div className="text-[10px] uppercase text-slate-500">{authUser.role}</div>
                  </div>
                )}
                <div className="text-right">
                <div className="text-xl font-mono text-white font-medium">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
                <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
                  {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
             </div>
             <button
               onClick={handleLogout}
               className="flex items-center gap-2 px-3 py-2 text-xs font-semibold border border-slate-700 rounded-md text-slate-300 hover:text-white hover:border-indigo-500 transition-colors"
             >
               <Lock className="w-4 h-4" />
               Log out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl w-full mx-auto px-4 py-6 overflow-hidden box-border">
        {!serverOnline && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/40 text-amber-200 px-3 py-2 rounded-lg text-sm">
            Server unreachable. Controls are temporarily disabled until connection is restored.
          </div>
        )}
        {serverOnline && !agentOnline && (
          <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-200 px-3 py-2 rounded-lg text-sm">
            Agent {agentId || ''} is offline. Controls are disabled until it reconnects.
          </div>
        )}
        {activeTab === Tab.DASHBOARD && renderDashboard()}
        {activeTab === Tab.SCHEDULE && renderScheduler()}
        {activeTab === Tab.SETTINGS && (
           <div className="text-center py-20 text-slate-500">
             <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
             <h3 className="text-lg text-slate-300 font-medium mb-2">Raspberry Pi Configuration</h3>
             <p className="text-sm max-w-sm mx-auto mb-6">
               {isMockMode 
                 ? "Mock mode: no Raspberry Pi GPIO connected. Start the Pi service to control real hardware." 
                 : "Connected to Real Hardware (Raspberry Pi GPIO ready)"}
             </p>
             
             {isMockMode && (
               <div className="text-left max-w-sm mx-auto bg-slate-900 p-4 rounded-lg font-mono text-xs text-slate-400 overflow-x-auto border border-amber-500/20">
                 <p className="mb-2 text-amber-400 font-bold">Not Connected to Hardware</p>
                 <p className="mb-2 text-slate-300">To start the backend server on your Pi:</p>
                 <p className="text-emerald-400">1. npm install</p>
                 <p className="text-emerald-400">2. node server.js</p>
               </div>
             )}
           </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 pb-safe">
        <div className="max-w-3xl mx-auto px-6 py-3 flex justify-between items-center">
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
