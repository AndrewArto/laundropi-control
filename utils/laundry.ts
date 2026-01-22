import type { Laundry, Relay, RelayGroup } from '../types';

export const isLaundryOnline = (
  laundry: Laundry,
  serverOnline: boolean,
  AGENT_STALE_MS: number
) => {
  const fresh = laundry.lastHeartbeat ? (Date.now() - laundry.lastHeartbeat) < AGENT_STALE_MS : false;
  return serverOnline && laundry.isOnline && fresh;
};

export const getOfflineAgents = (
  laundries: Laundry[],
  isOnlineCheck: (laundry: Laundry) => boolean
) => {
  return laundries.filter(laundry => !isOnlineCheck(laundry));
};

export const getOfflineMessages = (
  serverOnline: boolean,
  offlineAgents: Laundry[]
) => {
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
};

export const normalizeGroupPayload = (g: any, fallbackAgentId: string): RelayGroup => {
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

export const applyVisibility = (agentId: string, list: Relay[], visibilityMap: Record<string, boolean>, relayDraftKey: (agentId: string, relayId: number) => string) => {
  return list.map(r => {
    const key = relayDraftKey(agentId, r.id);
    return visibilityMap[key] !== undefined ? { ...r, isHidden: visibilityMap[key] } : r;
  });
};

export const updateLaundryRelays = (
  setLaundries: React.Dispatch<React.SetStateAction<Laundry[]>>,
  id: string,
  updater: (relays: Relay[]) => Relay[]
) => {
  setLaundries(prev => prev.map(l => (l.id === id ? { ...l, relays: updater(l.relays) } : l)));
};
