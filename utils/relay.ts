import type { Laundry } from '../types';

export const selectionKey = (agentId: string, relayId: number) => `${agentId}__${relayId}`;
export const relayDraftKey = (agentId: string, relayId: number) => `${agentId}::${relayId}`;
export const relayPendingKey = (agentId: string, relayId: number) => `${agentId}::${relayId}`;

export const markPendingRelayState = (
  pendingRef: React.MutableRefObject<Map<string, { state: boolean; updatedAt: number }>>,
  agentId: string,
  relayId: number,
  isOn: boolean
) => {
  pendingRef.current.set(relayPendingKey(agentId, relayId), { state: isOn, updatedAt: Date.now() });
};

export const applyPendingRelayStates = (
  items: Laundry[],
  pendingRef: React.MutableRefObject<Map<string, { state: boolean; updatedAt: number }>>,
  PENDING_RELAY_TTL_MS: number
) => {
  const pending = pendingRef.current;
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
