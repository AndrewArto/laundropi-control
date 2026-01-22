import React from 'react';
import { Plus, CalendarClock } from 'lucide-react';
import { Relay, RelayGroup } from '../../types';
import { GroupForm } from '../GroupForm';
import { GroupCard } from '../GroupCard';

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
      <div className="space-y-3 max-w-full overflow-hidden">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Groups & Schedules</h2>
          </div>
          <button
            onClick={() => {
              props.setIsNewGroupVisible(v => !v);
              if (!props.isNewGroupVisible) {
                props.setNewGroupName('New Group');
                props.setNewGroupSelections([]);
                props.setGroupSelectionTouched(false);
                props.setNewGroupOnTime('');
                props.setNewGroupOffTime('');
                props.setNewGroupDays([...props.DAYS_OF_WEEK]);
              }
            }}
            disabled={props.controlsDisabled}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg border border-indigo-500 text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {props.isNewGroupVisible ? 'Close' : 'Add Group'}
          </button>
        </div>
        {props.isNewGroupVisible && (
          <GroupForm
            visibleByLaundry={visibleByLaundry}
            newGroupName={props.newGroupName}
            newGroupSelections={props.newGroupSelections}
            newGroupOnTime={props.newGroupOnTime}
            newGroupOffTime={props.newGroupOffTime}
            newGroupDays={props.newGroupDays}
            controlsDisabled={props.controlsDisabled}
            selectionSet={selectionSet}
            DAYS_OF_WEEK={props.DAYS_OF_WEEK}
            setNewGroupName={props.setNewGroupName}
            setGroupSelectionTouched={props.setGroupSelectionTouched}
            setNewGroupSelections={props.setNewGroupSelections}
            setNewGroupOnTime={props.setNewGroupOnTime}
            setNewGroupOffTime={props.setNewGroupOffTime}
            setNewGroupDays={props.setNewGroupDays}
            isLaundryOnline={props.isLaundryOnline}
            selectionKey={props.selectionKey}
            dedupeSelections={props.dedupeSelections}
            normalizeTimeInput={props.normalizeTimeInput}
            to24h={props.to24h}
            handleAddGroup={props.handleAddGroup}
          />
        )}
      </div>

      <div className="space-y-3">
        {props.groups.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
            No groups yet.
          </div>
        ) : (
          props.groups.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              visibleByLaundry={visibleByLaundry}
              editingGroupId={props.editingGroupId}
              controlsDisabled={props.controlsDisabled}
              groupEditAreaRef={props.groupEditAreaRef}
              DAYS_OF_WEEK={props.DAYS_OF_WEEK}
              setGroups={props.setGroups}
              setEditingGroupId={props.setEditingGroupId}
              selectionKey={props.selectionKey}
              normalizeTimeInput={props.normalizeTimeInput}
              to24h={props.to24h}
              handleUpdateGroup={props.handleUpdateGroup}
              handleDeleteGroup={props.handleDeleteGroup}
              handleToggleGroupPower={props.handleToggleGroupPower}
            />
          ))
        )}
      </div>
    </div>
  );
};
