import React from 'react';
import { Relay } from '../types';

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

interface GroupFormProps {
  visibleByLaundry: VisibleLaundry[];
  newGroupName: string;
  newGroupSelections: { agentId: string; relayId: number }[];
  newGroupOnTime: string;
  newGroupOffTime: string;
  newGroupDays: string[];
  controlsDisabled: boolean;
  selectionSet: Set<string>;
  DAYS_OF_WEEK: readonly string[];
  setNewGroupName: (name: string) => void;
  setGroupSelectionTouched: (touched: boolean) => void;
  setNewGroupSelections: React.Dispatch<React.SetStateAction<{ agentId: string; relayId: number }[]>>;
  setNewGroupOnTime: (time: string) => void;
  setNewGroupOffTime: (time: string) => void;
  setNewGroupDays: React.Dispatch<React.SetStateAction<string[]>>;
  isLaundryOnline: (laundry: Laundry) => boolean;
  selectionKey: (agentId: string, relayId: number) => string;
  dedupeSelections: (items: { agentId: string; relayId: number }[]) => { agentId: string; relayId: number }[];
  normalizeTimeInput: (val?: string | null) => string | null;
  to24h: (val?: string | null) => string | null;
  handleAddGroup: () => Promise<void>;
}

export const GroupForm: React.FC<GroupFormProps> = ({
  visibleByLaundry,
  newGroupName,
  newGroupSelections,
  newGroupOnTime,
  newGroupOffTime,
  newGroupDays,
  controlsDisabled,
  selectionSet,
  DAYS_OF_WEEK,
  setNewGroupName,
  setGroupSelectionTouched,
  setNewGroupSelections,
  setNewGroupOnTime,
  setNewGroupOffTime,
  setNewGroupDays,
  isLaundryOnline,
  selectionKey,
  dedupeSelections,
  normalizeTimeInput,
  to24h,
  handleAddGroup,
}) => {
  return (
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
              pattern="^([01]?\d|2[0-3]):[0-5]\d$"
              maxLength={5}
              placeholder="HH:MM"
              value={newGroupOnTime}
              onChange={(e) => setNewGroupOnTime(normalizeTimeInput(e.target.value) || '')}
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
              pattern="^([01]?\d|2[0-3]):[0-5]\d$"
              maxLength={5}
              placeholder="HH:MM"
              value={newGroupOffTime}
              onChange={(e) => setNewGroupOffTime(normalizeTimeInput(e.target.value) || '')}
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
  );
};
