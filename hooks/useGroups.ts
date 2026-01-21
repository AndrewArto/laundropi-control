import { useState, useCallback } from 'react';
import { RelayGroup, Relay } from '../types';
import { ApiService } from '../services/api';
import { DAYS_OF_WEEK } from '../constants';

type RelaySelection = { agentId: string; relayId: number };

export interface UseGroupsReturn {
  groups: RelayGroup[];
  newGroupName: string;
  newGroupSelections: RelaySelection[];
  newGroupOnTime: string;
  newGroupOffTime: string;
  newGroupDays: string[];
  editingGroupId: string | null;
  groupSelectionTouched: boolean;
  isNewGroupVisible: boolean;
  setGroups: React.Dispatch<React.SetStateAction<RelayGroup[]>>;
  setNewGroupName: React.Dispatch<React.SetStateAction<string>>;
  setNewGroupSelections: React.Dispatch<React.SetStateAction<RelaySelection[]>>;
  setNewGroupOnTime: React.Dispatch<React.SetStateAction<string>>;
  setNewGroupOffTime: React.Dispatch<React.SetStateAction<string>>;
  setNewGroupDays: React.Dispatch<React.SetStateAction<string[]>>;
  setEditingGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  setGroupSelectionTouched: React.Dispatch<React.SetStateAction<boolean>>;
  setIsNewGroupVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleAddGroup: (primaryAgentId: string, to24h: (val?: string | null) => string | null, normalizeGroupPayload: (g: any, fallbackAgentId: string) => RelayGroup, setActiveTab: (tab: any) => void) => Promise<void>;
  handleUpdateGroup: (groupId: string, updates: Partial<RelayGroup>, primaryAgentId: string, laundries: any[], to24h: (val?: string | null) => string | null, normalizeGroupPayload: (g: any, fallbackAgentId: string) => RelayGroup) => Promise<void>;
  handleDeleteGroup: (id: string, primaryAgentId: string) => Promise<void>;
  handleToggleGroupPower: (id: string, action: 'ON' | 'OFF', primaryAgentId: string, serverOnline: boolean, markPendingRelayState: (agentId: string, relayId: number, desiredOn: boolean) => void, updateLaundryRelays: (agentId: string, updater: (relays: Relay[]) => Relay[]) => void, setRelays: React.Dispatch<React.SetStateAction<Relay[]>>, latestRelaysRef: React.MutableRefObject<Relay[]>, handleAuthFailure: (err: unknown) => boolean) => Promise<void>;
  dedupeSelections: (items: RelaySelection[]) => RelaySelection[];
  resetGroupsState: () => void;
}

export function useGroups(): UseGroupsReturn {
  const [groups, setGroups] = useState<RelayGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSelections, setNewGroupSelections] = useState<RelaySelection[]>([]);
  const [newGroupOnTime, setNewGroupOnTime] = useState<string>('');
  const [newGroupOffTime, setNewGroupOffTime] = useState<string>('');
  const [newGroupDays, setNewGroupDays] = useState<string[]>([...DAYS_OF_WEEK]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupSelectionTouched, setGroupSelectionTouched] = useState(false);
  const [isNewGroupVisible, setIsNewGroupVisible] = useState(false);

  const dedupeSelections = useCallback((items: RelaySelection[]) => {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = `${item.agentId}::${item.relayId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  const handleAddGroup = useCallback(async (
    primaryAgentId: string,
    to24h: (val?: string | null) => string | null,
    normalizeGroupPayload: (g: any, fallbackAgentId: string) => RelayGroup,
    setActiveTab: (tab: any) => void
  ) => {
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
    setActiveTab('SCHEDULE' as any);

    // Reset form
    setNewGroupName('');
    setNewGroupSelections([]);
    setGroupSelectionTouched(false);
    setNewGroupOnTime('');
    setNewGroupOffTime('');
    setNewGroupDays([...DAYS_OF_WEEK]);
    setIsNewGroupVisible(false);
  }, [newGroupName, newGroupSelections, newGroupOnTime, newGroupOffTime, newGroupDays, dedupeSelections]);

  const handleUpdateGroup = useCallback(async (
    groupId: string,
    updates: Partial<RelayGroup>,
    primaryAgentId: string,
    laundries: any[],
    to24h: (val?: string | null) => string | null,
    normalizeGroupPayload: (g: any, fallbackAgentId: string) => RelayGroup
  ) => {
    const existing = groups.find(g => g.id === groupId);
    if (!existing) return;

    const visibleMap = new Map<string, Set<number>>();
    laundries.forEach(l => {
      visibleMap.set(l.id, new Set((l.relays || []).filter((r: Relay) => !r.isHidden).map((r: Relay) => r.id)));
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
  }, [groups]);

  const handleDeleteGroup = useCallback(async (id: string, primaryAgentId: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
    await ApiService.deleteGroup(primaryAgentId, id);
  }, []);

  const handleToggleGroupPower = useCallback(async (
    id: string,
    action: 'ON' | 'OFF',
    primaryAgentId: string,
    serverOnline: boolean,
    markPendingRelayState: (agentId: string, relayId: number, desiredOn: boolean) => void,
    updateLaundryRelays: (agentId: string, updater: (relays: Relay[]) => Relay[]) => void,
    setRelays: React.Dispatch<React.SetStateAction<Relay[]>>,
    latestRelaysRef: React.MutableRefObject<Relay[]>,
    handleAuthFailure: (err: unknown) => boolean
  ) => {
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
  }, [groups]);

  const resetGroupsState = useCallback(() => {
    setGroups([]);
    setNewGroupName('');
    setNewGroupSelections([]);
    setNewGroupOnTime('');
    setNewGroupOffTime('');
    setNewGroupDays([...DAYS_OF_WEEK]);
    setEditingGroupId(null);
    setGroupSelectionTouched(false);
    setIsNewGroupVisible(false);
  }, []);

  return {
    groups,
    newGroupName,
    newGroupSelections,
    newGroupOnTime,
    newGroupOffTime,
    newGroupDays,
    editingGroupId,
    groupSelectionTouched,
    isNewGroupVisible,
    setGroups,
    setNewGroupName,
    setNewGroupSelections,
    setNewGroupOnTime,
    setNewGroupOffTime,
    setNewGroupDays,
    setEditingGroupId,
    setGroupSelectionTouched,
    setIsNewGroupVisible,
    handleAddGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleToggleGroupPower,
    dedupeSelections,
    resetGroupsState,
  };
}
