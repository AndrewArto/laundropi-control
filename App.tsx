import React, { useEffect, useState } from 'react';
import { LayoutDashboard, CalendarClock, Settings, Trash2, Cpu, Server, Pencil, Lock } from 'lucide-react';
import RelayCard from './components/RelayCard';
import { Relay, Schedule, RelayType, RelayGroup } from './types';
import { ApiService } from './services/api';
import { DAYS_OF_WEEK } from './constants';

enum Tab {
  DASHBOARD = 'DASHBOARD',
  SCHEDULE = 'SCHEDULE',
  SETTINGS = 'SETTINGS'
}

const AUTH_STORAGE_KEY = 'laundropi-auth-v1';
const AUTH_USERNAME = (import.meta as any).env?.VITE_APP_USER ?? 'admin';
const AUTH_PASSWORD = (import.meta as any).env?.VITE_APP_PASSWORD ?? 'laundropi';

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

const App: React.FC = () => {
  console.log('[LaundroPi] App mounted render cycle start');

  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLogin, setAuthLogin] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [relays, setRelays] = useState<Relay[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [groups, setGroups] = useState<RelayGroup[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newGroupName, setNewGroupName] = useState('New Group');
  const [newGroupRelayIds, setNewGroupRelayIds] = useState<number[]>([]);
  const [newGroupOnTime, setNewGroupOnTime] = useState<string>('');
  const [newGroupOffTime, setNewGroupOffTime] = useState<string>('');
  const [newGroupDays, setNewGroupDays] = useState<string[]>([...DAYS_OF_WEEK]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupSelectionTouched, setGroupSelectionTouched] = useState(false);
  const latestRelaysRef = React.useRef<Relay[]>([]);
  const [isRelayEditMode, setIsRelayEditMode] = useState(false);
  const isRelayEditModeRef = React.useRef(false);
  const isAuthenticatedRef = React.useRef(false);
  const [relayNameDrafts, setRelayNameDrafts] = useState<Record<number, string>>({});
  const [relayVisibility, setRelayVisibility] = useState<Record<number, boolean>>({});
  const relayVisibilityRef = React.useRef<Record<number, boolean>>({});
  const [serverOnline, setServerOnline] = useState(true);
  const controlsDisabled = !serverOnline;

  const applyVisibility = (list: Relay[]) => {
    const visMap = relayVisibilityRef.current;
    return list.map(r => visMap[r.id] !== undefined ? { ...r, isHidden: visMap[r.id] } : r);
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
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved === '1') {
        setIsAuthenticated(true);
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }
    } catch {
      setIsLoading(false);
    }
  }, []);

  // Fetch data
  const fetchData = async (force = false) => {
    try {
      if (isRelayEditModeRef.current && !force) {
        setIsLoading(false);
        return;
      }
      const data = await ApiService.getStatus();
      setServerOnline(true);
      if (!isAuthenticatedRef.current) {
        setIsLoading(false);
        return;
      }
      const serverVis: Record<number, boolean> = {};
      data.relays.forEach(r => { serverVis[r.id] = !!r.isHidden; });
      relayVisibilityRef.current = serverVis;
      setRelayVisibility(serverVis);
      latestRelaysRef.current = data.relays;
      setRelays(data.relays);
      setSchedules(data.schedules);
      setGroups(prev => {
        if (data.groups && data.groups.length > 0) return data.groups;
        // keep existing client-side groups if server has none yet
        return prev;
      });
      setIsMockMode(data.isMock);
      setIsLoading(false);
    } catch (err) {
      console.error('Critical Failure:', err);
      setServerOnline(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    fetchData();
    const poller = setInterval(fetchData, 10000);
    return () => clearInterval(poller);
  }, [isAuthenticated]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    isRelayEditModeRef.current = isRelayEditMode;
  }, [isRelayEditMode]);

  useEffect(() => {
    relayVisibilityRef.current = relayVisibility;
  }, [relayVisibility]);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const loginOk = authLogin.trim() === AUTH_USERNAME;
    const passOk = authPassword === AUTH_PASSWORD;
    if (loginOk && passOk) {
      setIsAuthenticated(true);
      isAuthenticatedRef.current = true;
      setAuthError('');
      setRelays([]);
      setSchedules([]);
      setGroups([]);
      setRelayNameDrafts({});
      setRelayVisibility({});
      relayVisibilityRef.current = {};
      latestRelaysRef.current = [];
      setNewGroupRelayIds([]);
      setGroupSelectionTouched(false);
      setIsLoading(true);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(AUTH_STORAGE_KEY, '1');
        } catch {
          // ignore
        }
      }
    } else {
      setAuthError('Неверный логин или пароль');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    isAuthenticatedRef.current = false;
    setAuthLogin('');
    setAuthPassword('');
    setAuthError('');
    setRelays([]);
    setSchedules([]);
    setGroups([]);
    setIsMockMode(true);
    setIsRelayEditMode(false);
    isRelayEditModeRef.current = false;
    setRelayNameDrafts({});
    setRelayVisibility({});
    relayVisibilityRef.current = {};
    latestRelaysRef.current = [];
    setNewGroupName('New Group');
    setNewGroupRelayIds([]);
    setNewGroupOnTime('');
    setNewGroupOffTime('');
    setNewGroupDays([...DAYS_OF_WEEK]);
    setGroupSelectionTouched(false);
    setIsLoading(false);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  // Sync drafts and visibility
  useEffect(() => {
    // Only prefill new-group selection when untouched (avoid clobbering user edits on polls)
    if (!groupSelectionTouched && newGroupRelayIds.length === 0) {
      setNewGroupRelayIds(relays.filter(r => !r.isHidden).map(r => r.id));
    }
    // Avoid overwriting draft names while in relay edit mode
    if (!isRelayEditMode) {
      const drafts: Record<number, string> = {};
      const visibility: Record<number, boolean> = {};
      relays.forEach(r => { drafts[r.id] = r.name; });
      relays.forEach(r => { visibility[r.id] = Boolean(r.isHidden); });
      setRelayNameDrafts(drafts);
      setRelayVisibility(visibility);
    }
    // Adjust default new group times to empty if server provided meta without times
    if (!groupSelectionTouched && !newGroupOnTime && !newGroupOffTime) {
      setNewGroupOnTime('');
      setNewGroupOffTime('');
    }
    console.log('[LaundroPi] relays loaded:', relays.length, 'visible:', relays.filter(r => !r.isHidden).length);
  }, [relays, newGroupRelayIds.length, groupSelectionTouched, isRelayEditMode, newGroupOnTime, newGroupOffTime]);

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
    if (!relays.length) return;
    const visibleSet = new Set(relays.filter(r => !r.isHidden).map(r => r.id));
    setGroups(prev => prev.map(g => ({
      ...g,
      relayIds: (g.relayIds || []).filter(id => visibleSet.has(id))
    })));
  }, [relays]);

  const handleToggleRelay = async (id: number) => {
    if (!serverOnline) return;
    const current = relays.find(r => r.id === id);
    const nextState = current?.isOn ? 'OFF' : 'ON';
    setRelays(prev => prev.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));
    latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r);
    await ApiService.setRelayState(id, nextState === 'ON' ? 'on' : 'off');
    fetchData(true);
  };

  const handleBatchControl = async (ids: number[], action: 'ON' | 'OFF') => {
    if (!serverOnline) return;
    setRelays(prev => {
      const next = prev.map(r => ids.includes(r.id) ? { ...r, isOn: action === 'ON' } : r);
      const merged = applyVisibility(next);
      latestRelaysRef.current = merged;
      return merged;
    });
    await ApiService.batchControl(ids, action);
  };

  const handleRenameRelay = async (id: number) => {
    if (!serverOnline) return;
    const name = (relayNameDrafts[id] || '').trim();
    if (!name) return;
    setRelays(prev => prev.map(r => r.id === id ? { ...r, name } : r));
    await ApiService.renameRelay(id, name);
    // keep latest ref in sync so exiting edit doesn't revert names
    latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, name } : r);
  };

  const handleRelayNameInput = (id: number, name: string) => {
    setRelayNameDrafts(prev => ({ ...prev, [id]: name }));
  };

  const handleToggleVisibility = async (id: number) => {
    if (!serverOnline) return;
    const newHidden = !relayVisibility[id];
    setRelayVisibility(prev => ({ ...prev, [id]: newHidden }));
    relayVisibilityRef.current = { ...relayVisibilityRef.current, [id]: newHidden };
    // Update relays locally; if unhidden, default to OFF
    setRelays(prev => {
      const next = prev.map(r => {
        if (r.id !== id) return r;
        return { ...r, isHidden: newHidden, isOn: newHidden ? r.isOn : false };
      });
      latestRelaysRef.current = next;
      return next;
    });
    // Adjust schedules
    setSchedules(prev => prev.map(s => ({ ...s, relayIds: s.relayIds.filter(rid => rid !== id) })));

    // Adjust groups: remove hidden relay; add back to all groups when unhidden
    setGroups(prev => {
      const updatedGroups = prev.map(g => {
        const exists = (g.relayIds || []).includes(id);
        if (newHidden && exists) {
          return { ...g, relayIds: g.relayIds.filter(rid => rid !== id) };
        }
        if (!newHidden && !exists) {
          return { ...g, relayIds: [...(g.relayIds || []), id] };
        }
        return g;
      });
      // Persist changes to server asynchronously
      updatedGroups.forEach((g, idx) => {
        const prevGroup = prev[idx];
        if (JSON.stringify(prevGroup?.relayIds || []) !== JSON.stringify(g.relayIds || [])) {
          handleUpdateGroup(g.id, { relayIds: g.relayIds || [] });
        }
      });
      return updatedGroups;
    });

    const updated = await ApiService.setRelayVisibility(id, newHidden);
    setRelays(prev => prev.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r));
    latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r);
    // Force refresh from server to persist state even while in edit mode
    await fetchData(true);
  };

  const handleIconChange = async (id: number, iconType: Relay['iconType']) => {
    if (!iconType) return;
    setRelays(prev => prev.map(r => r.id === id ? { ...r, iconType } : r));
    await ApiService.setRelayIcon(id, iconType as RelayType);
  };

  const handleAddGroup = async () => {
    if (!newGroupName.trim() || newGroupRelayIds.length === 0) return;
    const onTime24 = to24h(newGroupOnTime);
    const offTime24 = to24h(newGroupOffTime);
    const payload: Omit<RelayGroup, 'id'> = {
      name: newGroupName.trim(),
      relayIds: newGroupRelayIds,
      onTime: onTime24,
      offTime: offTime24,
      days: newGroupDays,
      active: Boolean(onTime24 || offTime24)
    };
    const added = await ApiService.addGroup(payload);
    setGroups(prev => [...prev, added]);
    setActiveTab(Tab.SCHEDULE);
    // reset form
    setNewGroupName('New Group');
    setNewGroupRelayIds([]);
    setGroupSelectionTouched(false);
    setNewGroupOnTime('');
    setNewGroupOffTime('');
    setNewGroupDays([...DAYS_OF_WEEK]);
  };

  const handleUpdateGroup = async (groupId: string, updates: Partial<RelayGroup>) => {
    const existing = groups.find(g => g.id === groupId);
    if (!existing) return;
    const visibleSet = new Set(relays.filter(r => !r.isHidden).map(r => r.id));
    const sanitizedRelayIds = updates.relayIds
      ? updates.relayIds.filter(id => visibleSet.has(id))
      : existing.relayIds.filter(id => visibleSet.has(id));
    const next: RelayGroup = {
      ...existing,
      ...updates,
      relayIds: sanitizedRelayIds,
      onTime: updates.onTime === undefined ? existing.onTime : to24h(updates.onTime),
      offTime: updates.offTime === undefined ? existing.offTime : to24h(updates.offTime),
    };
    const saved = await ApiService.updateGroup(groupId, {
      name: next.name,
      relayIds: next.relayIds,
      onTime: next.onTime || null,
      offTime: next.offTime || null,
      days: next.days,
      active: next.active
    });
    setGroups(prev => prev.map(g => g.id === groupId ? saved : g));
  };

  const handleDeleteGroup = async (id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
    await ApiService.deleteGroup(id);
  };

  const handleToggleGroupPower = async (id: string, action: 'ON' | 'OFF') => {
    if (!serverOnline) return;
    const group = groups.find(g => g.id === id);
    const memberSet = new Set(group?.relayIds || []);
    setRelays(prev => {
      const updated = prev.map(r => (memberSet.has(r.id) ? { ...r, isOn: action === 'ON' } : r));
      latestRelaysRef.current = updated;
      return updated;
    });
    try {
      await ApiService.toggleGroup(id, action);
    } catch (err) {
      console.error('Group toggle failed', err);
    }
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-400" />
            System Status
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsRelayEditMode(prev => {
                  const next = !prev;
                  if (!next) {
                    // Leaving edit: fetch latest from server (persisted changes remain)
                    fetchData();
                  }
                  return next;
                });
              }}
              disabled={controlsDisabled}
              className={`px-3 py-1 text-xs rounded-md border transition-colors flex items-center gap-1 ${isRelayEditMode ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-slate-600 text-slate-300 hover:border-slate-500'} ${controlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Pencil className="w-4 h-4" />
              {isRelayEditMode ? 'Done' : 'Edit'}
            </button>
            {isMockMode ? (
               <span className="text-xs text-amber-400 flex items-center gap-1 bg-amber-400/10 px-2 py-1 rounded-full border border-amber-400/20">
                 <Server className="w-3 h-3" /> Simulation Mode
               </span>
            ) : (
              <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20">
                 <Cpu className="w-3 h-3" /> Hardware Connected
              </span>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(isRelayEditMode ? relays : relays.filter(r => !r.isHidden)).map(relay => (
            <RelayCard
              key={relay.id}
              relay={relay}
              onToggle={handleToggleRelay}
              isEditing={isRelayEditMode}
              nameValue={relayNameDrafts[relay.id] ?? relay.name}
              onNameChange={handleRelayNameInput}
              onNameSave={handleRenameRelay}
              isHidden={relay.isHidden}
              onToggleVisibility={handleToggleVisibility}
              onIconChange={handleIconChange}
              isDisabled={controlsDisabled}/>
          ))}
        </div>
      </div>
    </div>
  );

  const renderScheduler = () => {
    const visibleRelays = relays.filter(r => !r.isHidden);
    return (
      <div className="space-y-6 max-w-full overflow-hidden">
        <div className="space-y-3 max-w-full overflow-hidden">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Groups & Schedules</h2>
          </div>
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
                  <p className="text-sm text-slate-300">Devices</p>
                  <div className="flex gap-2 text-xs">
                    <button
                      onClick={() => setNewGroupRelayIds(visibleRelays.map(r => r.id))}
                      onMouseDown={() => setGroupSelectionTouched(true)}
                      disabled={controlsDisabled}
                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setNewGroupRelayIds([])}
                      onMouseDown={() => setGroupSelectionTouched(true)}
                      disabled={controlsDisabled}
                      className="px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {visibleRelays.map(relay => (
                    <button
                      key={relay.id}
                      onClick={() => {
                        setGroupSelectionTouched(true);
                        setNewGroupRelayIds(prev => prev.includes(relay.id) ? prev.filter(id => id !== relay.id) : [...prev, relay.id]);
                      }}
                      disabled={controlsDisabled}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${newGroupRelayIds.includes(relay.id) ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/40 text-slate-300 border-slate-700 hover:border-slate-600'}`}
                    >
                      {relay.name}
                    </button>
                  ))}
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
                    onChange={(e) => setNewGroupOnTime(e.target.value)}
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
                    onChange={(e) => setNewGroupOffTime(e.target.value)}
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
                disabled={!newGroupName.trim() || newGroupRelayIds.length === 0 || controlsDisabled}
              >
                Save Group
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
              No groups yet.
            </div>
          ) : (
            groups.map(group => {
              const selectedRelayIds = group.relayIds || [];
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

                  <div className="flex gap-2 flex-wrap">
                    {visibleRelays.map(relay => (
                      <button
                        key={relay.id}
                        onClick={() => {
                          if (editingGroupId !== group.id) return;
                          const next = selectedRelayIds.includes(relay.id)
                            ? selectedRelayIds.filter(id => id !== relay.id)
                            : [...selectedRelayIds, relay.id];
                          setGroups(prev => prev.map(g => g.id === group.id ? { ...g, relayIds: next } : g));
                          handleUpdateGroup(group.id, { relayIds: next });
                        }}
                        disabled={controlsDisabled || editingGroupId !== group.id}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                          selectedRelayIds.includes(relay.id) ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/40 text-slate-300 border-slate-700 hover:border-slate-600'
                        } ${editingGroupId === group.id ? '' : 'opacity-60 cursor-not-allowed'}`}
                      >
                        {relay.name}
                      </button>
                    ))}
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
                        onChange={(e) => editingGroupId === group.id && setGroups(prev => prev.map(g => g.id === group.id ? { ...g, onTime: e.target.value } : g))}
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
                        onChange={(e) => editingGroupId === group.id && setGroups(prev => prev.map(g => g.id === group.id ? { ...g, offTime: e.target.value } : g))}
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-sm bg-slate-800/70 border border-slate-700 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Secure Access</p>
              <h2 className="text-lg font-semibold text-white">LaundroPi Control</h2>
            </div>
          </div>
          <form className="space-y-4" onSubmit={handleLoginSubmit}>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Логин</label>
              <input
                value={authLogin}
                onChange={(e) => setAuthLogin(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Введите логин"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Пароль</label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Введите пароль"
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
              Войти
            </button>
            <p className="text-[11px] text-slate-500 text-center">
              Настройте логин и пароль через переменные среды VITE_APP_USER и VITE_APP_PASSWORD
            </p>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading && relays.length === 0) {
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
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              LaundroPi
            </h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${!isMockMode ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <p className="text-xs text-slate-500">
                {!isMockMode ? 'Connected to Pi' : 'Mock mode (no GPIO)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
                 <p className="text-emerald-400">1. npm install express onoff cors</p>
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
