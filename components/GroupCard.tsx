import React from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { Relay, RelayGroup } from '../types';

interface Laundry {
  id: string;
  name: string;
  relays: Relay[];
  isOnline: boolean;
  isMock: boolean;
  lastHeartbeat: number | null;
}

interface VisibleLaundry extends Laundry {
  visibleRelays: Relay[];
}

interface GroupCardProps {
  group: RelayGroup;
  visibleByLaundry: VisibleLaundry[];
  editingGroupId: string | null;
  controlsDisabled: boolean;
  groupEditAreaRef: React.RefObject<HTMLDivElement>;
  DAYS_OF_WEEK: readonly string[];
  setGroups: React.Dispatch<React.SetStateAction<RelayGroup[]>>;
  setEditingGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  selectionKey: (agentId: string, relayId: number) => string;
  normalizeTimeInput: (val?: string | null) => string | null;
  to24h: (val?: string | null) => string | null;
  handleUpdateGroup: (groupId: string, updates: Partial<RelayGroup>) => Promise<void>;
  handleDeleteGroup: (id: string) => Promise<void>;
  handleToggleGroupPower: (id: string, action: 'ON' | 'OFF') => Promise<void>;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  visibleByLaundry,
  editingGroupId,
  controlsDisabled,
  groupEditAreaRef,
  DAYS_OF_WEEK,
  setGroups,
  setEditingGroupId,
  selectionKey,
  normalizeTimeInput,
  to24h,
  handleUpdateGroup,
  handleDeleteGroup,
  handleToggleGroupPower,
}) => {
  const selectedSet = new Set(
    (group.entries || []).flatMap(e => (e.relayIds || []).map(id => selectionKey(e.agentId, id)))
  );

  return (
    <div
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
            pattern="^([01]?\d|2[0-3]):[0-5]\d$"
            maxLength={5}
            placeholder="HH:MM"
            value={group.onTime || ''}
            onChange={(e) => {
              if (editingGroupId !== group.id) return;
              const next = normalizeTimeInput(e.target.value);
              setGroups(prev => prev.map(g => g.id === group.id ? { ...g, onTime: next || '' } : g));
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
            pattern="^([01]?\d|2[0-3]):[0-5]\d$"
            maxLength={5}
            placeholder="HH:MM"
            value={group.offTime || ''}
            onChange={(e) => {
              if (editingGroupId !== group.id) return;
              const next = normalizeTimeInput(e.target.value);
              setGroups(prev => prev.map(g => g.id === group.id ? { ...g, offTime: next || '' } : g));
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
};
