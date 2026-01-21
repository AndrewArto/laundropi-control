import React from 'react';
import { Plus, Trash2, CalendarClock } from 'lucide-react';
import { Relay, RelayGroup } from '../../types';

interface Laundry {
  id: string;
  name: string;
  relays: Relay[];
  isOnline: boolean;
  isMock: boolean;
  lastHeartbeat: number | null;
}

interface SchedulesViewProps {
  laundries: Laundry[];
  newGroupSelections: { agentId: string; relayId: number }[];
  newGroupName: string;
  newGroupOnTime: string;
  newGroupOffTime: string;
  newGroupDays: string[];
  isNewGroupVisible: boolean;
  groups: RelayGroup[];
  editingGroupId: string | null;
  controlsDisabled: boolean;
  groupSelectionTouched: boolean;
  serverOnline: boolean;
  groupEditAreaRef: React.RefObject<HTMLDivElement>;
  DAYS_OF_WEEK: readonly string[];
  setIsNewGroupVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setNewGroupName: React.Dispatch<React.SetStateAction<string>>;
  setNewGroupSelections: React.Dispatch<React.SetStateAction<{ agentId: string; relayId: number }[]>>;
  setNewGroupOnTime: React.Dispatch<React.SetStateAction<string>>;
  setNewGroupOffTime: React.Dispatch<React.SetStateAction<string>>;
  setNewGroupDays: React.Dispatch<React.SetStateAction<string[]>>;
  setGroups: React.Dispatch<React.SetStateAction<RelayGroup[]>>;
  setEditingGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  setGroupSelectionTouched: React.Dispatch<React.SetStateAction<boolean>>;
  isLaundryOnline: (laundry: Laundry) => boolean;
  selectionKey: (agentId: string, relayId: number) => string;
  dedupeSelections: (items: { agentId: string; relayId: number }[]) => { agentId: string; relayId: number }[];
  normalizeTimeInput: (val?: string | null) => string | null;
  to24h: (val?: string | null) => string | null;
  handleAddGroup: () => Promise<void>;
  handleUpdateGroup: (groupId: string, updates: Partial<RelayGroup>) => Promise<void>;
  handleDeleteGroup: (id: string) => Promise<void>;
  handleToggleGroupPower: (id: string, action: 'ON' | 'OFF') => Promise<void>;
}

export const SchedulesView: React.FC<SchedulesViewProps> = (props) => {
  const visibleByLaundry = props.laundries.map(l => ({
    ...l,
    visibleRelays: (l.relays || []).filter(r => !r.isHidden),
  }));
  const selectionSet = new Set(props.newGroupSelections.map(sel => props.selectionKey(sel.agentId, sel.relayId)));

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-indigo-400" />
          Schedule
        </h2>
        <button
          onClick={() => props.setIsNewGroupVisible(prev => !prev)}
          disabled={props.controlsDisabled}
          className="px-3 py-2 text-xs rounded-md border border-indigo-500 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          {props.isNewGroupVisible ? 'Cancel' : 'Add Group'}
        </button>
      </div>

      {props.isNewGroupVisible && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4">
          <div className="text-sm font-semibold text-white">Create New Group</div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Group Name</label>
            <input
              value={props.newGroupName}
              onChange={e => props.setNewGroupName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Washers"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">
              Select Relays {props.groupSelectionTouched && props.newGroupSelections.length === 0 && (
                <span className="text-red-400 ml-1">(at least one required)</span>
              )}
            </label>
            <div className="space-y-3">
              {visibleByLaundry.map(laundry => {
                const online = props.isLaundryOnline(laundry);
                return (
                  <div key={laundry.id} className="bg-slate-900/50 border border-slate-600 rounded-lg p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-300">{laundry.name}</div>
                    {laundry.visibleRelays.length === 0 ? (
                      <div className="text-xs text-slate-500">No visible relays</div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {laundry.visibleRelays.map(relay => {
                          const key = props.selectionKey(laundry.id, relay.id);
                          const checked = selectionSet.has(key);
                          return (
                            <label key={relay.id} className={`flex items-center gap-2 text-xs ${online ? 'text-slate-300' : 'text-slate-500'} cursor-pointer`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  props.setGroupSelectionTouched(true);
                                  if (e.target.checked) {
                                    props.setNewGroupSelections(prev => props.dedupeSelections([...prev, { agentId: laundry.id, relayId: relay.id }]));
                                  } else {
                                    props.setNewGroupSelections(prev => prev.filter(s => !(s.agentId === laundry.id && s.relayId === relay.id)));
                                  }
                                }}
                                className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                              />
                              {relay.name}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">On Time</label>
              <input
                type="text"
                value={props.newGroupOnTime}
                onChange={e => props.setNewGroupOnTime(e.target.value)}
                placeholder="e.g. 09:00"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Off Time</label>
              <input
                type="text"
                value={props.newGroupOffTime}
                onChange={e => props.setNewGroupOffTime(e.target.value)}
                placeholder="e.g. 17:00"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-2">Days</label>
            <div className="flex flex-wrap gap-2">
              {props.DAYS_OF_WEEK.map(day => {
                const selected = props.newGroupDays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() => {
                      if (selected) {
                        props.setNewGroupDays(prev => prev.filter(d => d !== day));
                      } else {
                        props.setNewGroupDays(prev => [...prev, day]);
                      }
                    }}
                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${selected ? 'border-indigo-500 text-indigo-300 bg-indigo-500/20' : 'border-slate-600 text-slate-300 hover:border-slate-500'}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={props.handleAddGroup}
            disabled={props.newGroupSelections.length === 0 || !props.newGroupName.trim()}
            className="w-full px-4 py-2 rounded-md text-sm font-semibold border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            Create Group
          </button>
        </div>
      )}

      <div ref={props.groupEditAreaRef} className="space-y-4">
        {props.groups.length === 0 && !props.isNewGroupVisible && (
          <div className="text-sm text-slate-500 bg-slate-800 border border-slate-700 rounded-lg p-4">
            No groups yet. Click "Add Group" to create one.
          </div>
        )}

        {props.groups.map(group => {
          const isEditing = props.editingGroupId === group.id;
          const groupEntries = group.entries || [];
          const laundryMap = new Map(props.laundries.map(l => [l.id, l]));

          const groupRelaySelections = groupEntries.flatMap(e =>
            (e.relayIds || []).map(rid => ({ agentId: e.agentId, relayId: rid }))
          );

          const groupSelectionSet = new Set(groupRelaySelections.map(sel => props.selectionKey(sel.agentId, sel.relayId)));

          const allOnline = groupEntries.every(e => {
            const laundry = laundryMap.get(e.agentId);
            return laundry ? props.isLaundryOnline(laundry) : false;
          });

          const hasRelays = groupRelaySelections.length > 0;

          return (
            <div key={group.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {isEditing ? (
                  <input
                    value={group.name}
                    onChange={e => {
                      props.setGroups(prev => prev.map(g => g.id === group.id ? { ...g, name: e.target.value } : g));
                    }}
                    className="flex-1 min-w-[120px] px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Group name"
                  />
                ) : (
                  <div className="text-sm font-semibold text-white">{group.name}</div>
                )}
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => props.handleToggleGroupPower(group.id, 'ON')}
                        disabled={!props.serverOnline || !hasRelays || !allOnline}
                        className="px-3 py-2 rounded-md text-xs font-semibold border border-emerald-500 text-emerald-200 bg-emerald-500/10 disabled:opacity-50"
                      >
                        ON
                      </button>
                      <button
                        onClick={() => props.handleToggleGroupPower(group.id, 'OFF')}
                        disabled={!props.serverOnline || !hasRelays || !allOnline}
                        className="px-3 py-2 rounded-md text-xs font-semibold border border-red-500 text-red-200 bg-red-500/10 disabled:opacity-50"
                      >
                        OFF
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (isEditing) {
                        props.setEditingGroupId(null);
                        props.handleUpdateGroup(group.id, { name: group.name });
                      } else {
                        props.setEditingGroupId(group.id);
                      }
                    }}
                    className="px-3 py-2 text-xs rounded-md border border-slate-600 text-slate-300 hover:border-slate-500"
                  >
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                  <button
                    onClick={() => props.handleDeleteGroup(group.id)}
                    className="p-2 rounded-md border border-red-500 text-red-300 bg-red-500/10 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {isEditing && (
                <>
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Relays in this group</label>
                    <div className="space-y-2">
                      {visibleByLaundry.map(laundry => {
                        const online = props.isLaundryOnline(laundry);
                        return (
                          <div key={laundry.id} className="bg-slate-900/50 border border-slate-600 rounded-lg p-3 space-y-2">
                            <div className="text-xs font-semibold text-slate-300">{laundry.name}</div>
                            {laundry.visibleRelays.length === 0 ? (
                              <div className="text-xs text-slate-500">No visible relays</div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {laundry.visibleRelays.map(relay => {
                                  const key = props.selectionKey(laundry.id, relay.id);
                                  const checked = groupSelectionSet.has(key);
                                  return (
                                    <label key={relay.id} className={`flex items-center gap-2 text-xs ${online ? 'text-slate-300' : 'text-slate-500'} cursor-pointer`}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={e => {
                                          const sel = { agentId: laundry.id, relayId: relay.id };
                                          let nextSelections: typeof groupRelaySelections;
                                          if (e.target.checked) {
                                            nextSelections = props.dedupeSelections([...groupRelaySelections, sel]);
                                          } else {
                                            nextSelections = groupRelaySelections.filter(s => !(s.agentId === sel.agentId && s.relayId === sel.relayId));
                                          }

                                          const entriesMap = new Map<string, number[]>();
                                          nextSelections.forEach(s => {
                                            const list = entriesMap.get(s.agentId) || [];
                                            list.push(s.relayId);
                                            entriesMap.set(s.agentId, list);
                                          });
                                          const nextEntries = Array.from(entriesMap.entries()).map(([agentId, relayIds]) => ({ agentId, relayIds }));

                                          props.handleUpdateGroup(group.id, {
                                            entries: nextEntries,
                                            relayIds: nextSelections.map(s => s.relayId)
                                          });
                                        }}
                                        className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                                      />
                                      {relay.name}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">On Time</label>
                      <input
                        type="text"
                        value={group.onTime || ''}
                        onChange={e => {
                          const val = e.target.value;
                          props.setGroups(prev => prev.map(g => g.id === group.id ? { ...g, onTime: val } : g));
                        }}
                        onBlur={() => {
                          const normalized = props.normalizeTimeInput(group.onTime);
                          props.handleUpdateGroup(group.id, { onTime: props.to24h(normalized) || null });
                        }}
                        placeholder="e.g. 09:00"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Off Time</label>
                      <input
                        type="text"
                        value={group.offTime || ''}
                        onChange={e => {
                          const val = e.target.value;
                          props.setGroups(prev => prev.map(g => g.id === group.id ? { ...g, offTime: val } : g));
                        }}
                        onBlur={() => {
                          const normalized = props.normalizeTimeInput(group.offTime);
                          props.handleUpdateGroup(group.id, { offTime: props.to24h(normalized) || null });
                        }}
                        placeholder="e.g. 17:00"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Days</label>
                    <div className="flex flex-wrap gap-2">
                      {props.DAYS_OF_WEEK.map(day => {
                        const selected = (group.days || []).includes(day);
                        return (
                          <button
                            key={day}
                            onClick={() => {
                              const nextDays = selected
                                ? (group.days || []).filter(d => d !== day)
                                : [...(group.days || []), day];
                              props.handleUpdateGroup(group.id, { days: nextDays });
                            }}
                            className={`px-3 py-1 text-xs rounded-md border transition-colors ${selected ? 'border-indigo-500 text-indigo-300 bg-indigo-500/20' : 'border-slate-600 text-slate-300 hover:border-slate-500'}`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-400">Schedule Active</label>
                    <input
                      type="checkbox"
                      checked={group.active ?? false}
                      onChange={e => props.handleUpdateGroup(group.id, { active: e.target.checked })}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              {!isEditing && (
                <div className="text-xs text-slate-400 space-y-1">
                  {group.onTime && <div>On: {group.onTime}</div>}
                  {group.offTime && <div>Off: {group.offTime}</div>}
                  {group.days && group.days.length > 0 && (
                    <div>Days: {group.days.map(d => d.slice(0, 3)).join(', ')}</div>
                  )}
                  <div>Schedule: {group.active ? 'Active' : 'Inactive'}</div>
                  <div>Relays: {groupRelaySelections.length}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
