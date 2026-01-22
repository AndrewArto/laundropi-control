import { useState, useCallback, useRef } from 'react';
import { Relay } from '../types';
import { ApiService } from '../services/api';

export interface UseRelaysReturn {
  relays: Relay[];
  relayNameDrafts: Record<string, string>;
  relayVisibility: Record<string, boolean>;
  toggleRelay: (agent: string, id: number) => Promise<void>;
  saveRelayName: (agent: string, id: number, name: string) => Promise<void>;
  updateRelayNameDraft: (key: string, name: string) => void;
  toggleRelayVisibility: (agent: string, id: number, currentHidden: boolean) => Promise<void>;
  updateRelayIcon: (agent: string, id: number, iconType: string) => Promise<void>;
  setRelays: React.Dispatch<React.SetStateAction<Relay[]>>;
  setRelayNameDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRelayVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  getPendingRelayState: (agentId: string, relayId: number) => { state: boolean; updatedAt: number } | undefined;
  setPendingRelayState: (agentId: string, relayId: number, isOn: boolean) => void;
  applyPendingRelayStates: (relays: Relay[]) => Relay[];
  resetRelayState: () => void;
}

const relayPendingKey = (agentId: string, relayId: number) => `${agentId}::${relayId}`;

export function useRelays(): UseRelaysReturn {
  const [relays, setRelays] = useState<Relay[]>([]);
  const [relayNameDrafts, setRelayNameDrafts] = useState<Record<string, string>>({});
  const [relayVisibility, setRelayVisibility] = useState<Record<string, boolean>>({});
  const pendingRelayStatesRef = useRef<Map<string, { state: boolean; updatedAt: number }>>(new Map());

  const setPendingRelayState = useCallback((agentId: string, relayId: number, isOn: boolean) => {
    pendingRelayStatesRef.current.set(relayPendingKey(agentId, relayId), { state: isOn, updatedAt: Date.now() });
  }, []);

  const getPendingRelayState = useCallback((agentId: string, relayId: number) => {
    return pendingRelayStatesRef.current.get(relayPendingKey(agentId, relayId));
  }, []);

  const applyPendingRelayStates = useCallback((relays: Relay[]) => {
    const pending = pendingRelayStatesRef.current;
    if (pending.size === 0) return relays;
    const now = Date.now();
    const MAX_PENDING_AGE_MS = 5000;
    return relays.map(relay => {
      const key = relayPendingKey(relay.agentId, relay.id);
      const p = pending.get(key);
      if (!p) return relay;
      if (now - p.updatedAt > MAX_PENDING_AGE_MS) {
        pending.delete(key);
        return relay;
      }
      return { ...relay, isOn: p.state };
    });
  }, []);

  const toggleRelay = useCallback(async (agent: string, id: number) => {
    const current = relays.find(r => r.id === id && r.agentId === agent);
    if (!current) return;

    const nextState = current.isOn ? 'OFF' : 'ON';
    // Optimistic update
    setRelays(prev => prev.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));

    try {
      await ApiService.setRelayState(agent, id, nextState === 'ON' ? 'on' : 'off');
    } catch (err) {
      console.error('Toggle relay failed:', err);
      // Revert on error
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));
      throw err;
    }
  }, [relays]);

  const saveRelayName = useCallback(async (agent: string, id: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Optimistic update
    setRelays(prev => prev.map(r => r.id === id ? { ...r, name: trimmed } : r));

    try {
      await ApiService.renameRelay(agent, id, trimmed);
    } catch (err) {
      console.error('Save relay name failed:', err);
      throw err;
    }
  }, []);

  const updateRelayNameDraft = useCallback((key: string, name: string) => {
    setRelayNameDrafts(prev => ({ ...prev, [key]: name }));
  }, []);

  const toggleRelayVisibility = useCallback(async (agent: string, id: number, currentHidden: boolean) => {
    const nextHidden = !currentHidden;
    const key = `${agent}::${id}`;

    // Optimistic update
    setRelayVisibility(prev => ({ ...prev, [key]: nextHidden }));
    setRelays(prev => prev.map(r => r.id === id ? { ...r, isHidden: nextHidden } : r));

    try {
      const updated = await ApiService.setRelayVisibility(agent, id, nextHidden);
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r));
    } catch (err) {
      console.error('Toggle relay visibility failed:', err);
      // Revert on error
      setRelayVisibility(prev => ({ ...prev, [key]: currentHidden }));
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isHidden: currentHidden } : r));
      throw err;
    }
  }, []);

  const updateRelayIcon = useCallback(async (agent: string, id: number, iconType: string) => {
    // Optimistic update
    setRelays(prev => prev.map(r => r.id === id ? { ...r, iconType } : r));

    try {
      await ApiService.setRelayIcon(agent, id, iconType as any);
    } catch (err) {
      console.error('Update relay icon failed:', err);
      throw err;
    }
  }, []);

  const resetRelayState = useCallback(() => {
    setRelays([]);
    setRelayNameDrafts({});
    setRelayVisibility({});
    pendingRelayStatesRef.current.clear();
  }, []);

  return {
    relays,
    relayNameDrafts,
    relayVisibility,
    toggleRelay,
    saveRelayName,
    updateRelayNameDraft,
    toggleRelayVisibility,
    updateRelayIcon,
    setRelays,
    setRelayNameDrafts,
    setRelayVisibility,
    getPendingRelayState,
    setPendingRelayState,
    applyPendingRelayStates,
    resetRelayState,
  };
}
