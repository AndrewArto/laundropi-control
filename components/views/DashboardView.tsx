import React, { useState } from 'react';
import { LayoutDashboard, Server, Cpu, Pencil, Camera as CameraIcon, CameraOff as CameraOffIcon, ChevronDown, ChevronRight, WashingMachine, Wind } from 'lucide-react';
import RelayCard from '../RelayCard';
import { Relay, CameraConfig, LaundryMachine, LaundryMachineStatus } from '../../types';

interface Laundry {
  id: string;
  name: string;
  relays: Relay[];
  isOnline: boolean;
  isMock: boolean;
  lastHeartbeat: number | null;
}

interface DashboardViewProps {
  laundries: Laundry[];
  isRelayEditMode: boolean;
  setIsRelayEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  serverOnline: boolean;
  cameraError: string | null;
  showCameraLoading: boolean;
  relayEditAreaRef: React.RefObject<HTMLDivElement>;
  isLaundryOnline: (laundry: Laundry) => boolean;
  getCameraSlots: (agentId: string) => CameraConfig[];
  handleBatchControl: (relayIds: number[], action: 'ON' | 'OFF', agentId: string) => void;
  handleToggleRelay: (relayId: number, agentId: string) => void;
  relayNameDrafts: Record<string, string>;
  relayDraftKey: (agentId: string, relayId: number) => string;
  handleRelayNameInput: (agentId: string, relayId: number, name: string) => void;
  handleRenameRelay: (relayId: number, agentId: string) => void;
  handleToggleVisibility: (relayId: number, agentId: string) => void;
  handleIconChange: (relayId: number, icon: string, agentId: string) => void;
  cameraDraftKey: (agentId: string, cameraId: string) => string;
  cameraNameDrafts: Record<string, string>;
  cameraSaving: Record<string, boolean>;
  cameraToggleLoading: Record<string, boolean>;
  cameraSaveErrors: Record<string, string | null>;
  cameraVisibility: Record<string, boolean>;
  isPageVisible: boolean;
  cameraFrameSources: Record<string, string>;
  buildCameraPreviewUrl: (camera: CameraConfig, agentId: string, options: { cacheBust: boolean }) => string;
  cameraWarmup: Record<string, number>;
  CAMERA_WARMUP_MS: number;
  handleCameraNameInput: (agentId: string, cameraId: string, name: string) => void;
  handleCameraEnabledToggle: (agentId: string, camera: CameraConfig) => void;
  handleCameraNameSave: (agentId: string, cameraId: string) => void;
  getCameraCardRef: (key: string) => (node: HTMLDivElement | null) => void;
  fetchLaundries: (skipLoading?: boolean) => void;
  machineStatus: Record<string, LaundryMachineStatus>;
}

export const DashboardView: React.FC<DashboardViewProps> = (props) => {
  const [expandedMachines, setExpandedMachines] = useState<Record<string, boolean>>({});

  const toggleMachines = (agentId: string) => {
    setExpandedMachines(prev => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  return (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <LayoutDashboard className="w-5 h-5 text-indigo-400" />
        Dashboard
      </h2>
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => {
            props.setIsRelayEditMode(prev => {
              const next = !prev;
              if (!next) {
                props.fetchLaundries(true);
              }
              return next;
            });
          }}
          data-edit-toggle="relay"
          disabled={!props.serverOnline}
          className={`px-3 py-2 text-xs rounded-md border transition-colors flex items-center gap-1 ${props.isRelayEditMode ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-slate-600 text-slate-300 hover:border-slate-500'} ${!props.serverOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Pencil className="w-4 h-4" />
          {props.isRelayEditMode ? 'Done' : 'Edit'}
        </button>
      </div>
    </div>

    {props.cameraError && (
      <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-3 py-2 rounded-lg text-sm">
        {props.cameraError}
      </div>
    )}
    {props.showCameraLoading && (
      <div className="text-xs text-slate-500">Loading cameras...</div>
    )}

    <div ref={props.relayEditAreaRef} className="space-y-6">
      {props.laundries.map((laundry) => {
        const online = props.isLaundryOnline(laundry);
        const relaysList = laundry.relays;
        const batchRelayIds = relaysList.filter(r => !r.isHidden).map(r => r.id);
        const visibleRelays = props.isRelayEditMode ? relaysList : relaysList.filter(r => !r.isHidden);
        const disabled = !online;
        const mock = laundry.isMock || !online;
        const cameras = props.getCameraSlots(laundry.id);
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
                  onClick={() => props.handleBatchControl(batchRelayIds, 'ON', laundry.id)}
                  disabled={!online || batchRelayIds.length === 0}
                  className="px-3 py-2 rounded-md text-xs font-semibold border border-emerald-500 text-emerald-200 bg-emerald-500/10 disabled:opacity-50"
                >
                  ON
                </button>
                <button
                  onClick={() => props.handleBatchControl(batchRelayIds, 'OFF', laundry.id)}
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
                  onToggle={() => props.handleToggleRelay(relay.id, laundry.id)}
                  isEditing={props.isRelayEditMode}
                  nameValue={props.relayNameDrafts[props.relayDraftKey(laundry.id, relay.id)] ?? relay.name}
                  onNameChange={(rid, name) => props.handleRelayNameInput(laundry.id, rid, name)}
                  onNameSave={(rid) => props.handleRenameRelay(rid, laundry.id)}
                  isHidden={relay.isHidden}
                  onToggleVisibility={(rid) => props.handleToggleVisibility(rid, laundry.id)}
                  onIconChange={(rid, icon) => props.handleIconChange(rid, icon, laundry.id)}
                  isDisabled={disabled}
                />
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-slate-400">Cameras</div>
                {props.isRelayEditMode && (
                  <div className="text-[11px] text-slate-500">Rename</div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(cameras || []).map(camera => {
                  const draftKey = props.cameraDraftKey(laundry.id, camera.id);
                  const nameValue = props.cameraNameDrafts[draftKey] ?? camera.name;
                  const saving = Boolean(props.cameraSaving[draftKey]);
                  const toggleLoading = Boolean(props.cameraToggleLoading[draftKey]);
                  const saveError = props.cameraSaveErrors[draftKey];
                  const inView = props.cameraVisibility[draftKey];
                  const shouldPollCamera = props.isPageVisible && (inView ?? true);
                  const frameSrc = props.cameraFrameSources[draftKey];
                  const patternFallbackSrc = camera.sourceType === 'pattern'
                    ? props.buildCameraPreviewUrl(camera, laundry.id, { cacheBust: false })
                    : undefined;
                  const effectiveFrameSrc = frameSrc || patternFallbackSrc;
                  const hasFrame = Boolean(effectiveFrameSrc);
                  const warmupStartedAt = props.cameraWarmup[draftKey];
                  const warmupActive = typeof warmupStartedAt === 'number'
                    ? (Date.now() - warmupStartedAt) < props.CAMERA_WARMUP_MS
                    : false;
                  const canRequestPreview = camera.enabled && shouldPollCamera && (camera.sourceType === 'pattern' || online);
                  const canShowPreview = canRequestPreview && hasFrame;
                  const showLoading = camera.sourceType !== 'pattern'
                    && ((toggleLoading && camera.enabled) || (warmupActive && !hasFrame));
                  const showPlaceholder = !canShowPreview && !showLoading;
                  const cameraToggleDisabled = !props.serverOnline || saving;
                  const showMockBadge = camera.sourceType === 'pattern';
                  return (
                    <div
                      key={camera.id}
                      ref={props.getCameraCardRef(draftKey)}
                      className="bg-slate-900/40 border border-slate-700 rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-700">
                        <div className="flex-1 min-w-0">
                          {props.isRelayEditMode ? (
                            <input
                              value={nameValue}
                              onChange={(e) => props.handleCameraNameInput(laundry.id, camera.id, e.target.value)}
                              className="w-full bg-transparent text-sm text-slate-200 focus:outline-none"
                              placeholder="Camera name"
                            />
                          ) : (
                            <div className="text-sm text-slate-200 truncate">{camera.name}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">{camera.position}</span>
                          {showMockBadge && (
                            <span className="text-[10px] px-2 py-1 rounded-full border border-amber-400 text-amber-200 bg-amber-500/10">
                              Mock
                            </span>
                          )}
                          <button
                            onClick={() => props.handleCameraEnabledToggle(laundry.id, camera)}
                            disabled={cameraToggleDisabled}
                            title={camera.enabled ? 'Disable camera' : 'Enable camera'}
                            aria-label={camera.enabled ? 'Disable camera' : 'Enable camera'}
                            className={`p-1.5 rounded-md border transition-colors ${
                              camera.enabled
                                ? 'border-emerald-400 text-emerald-200 bg-emerald-500/10 hover:border-emerald-300'
                                : 'border-red-400 text-red-200 bg-red-500/10 hover:border-red-300'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {camera.enabled ? <CameraIcon className="w-3.5 h-3.5" /> : <CameraOffIcon className="w-3.5 h-3.5" />}
                          </button>
                          {props.isRelayEditMode && (
                            <button
                              onClick={() => props.handleCameraNameSave(laundry.id, camera.id)}
                              disabled={saving}
                              className="text-[10px] px-2 py-1 rounded-md border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="relative aspect-video bg-slate-900">
                        {canShowPreview && effectiveFrameSrc && (
                          <img
                            src={effectiveFrameSrc}
                            alt={`${camera.name} feed`}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                        {showLoading && (
                          <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-slate-200">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="w-4 h-4 rounded-full border-2 border-slate-500 border-t-slate-200 animate-spin" />
                              Loading...
                            </div>
                          </div>
                        )}
                        {showPlaceholder && !showLoading && (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                            <CameraOffIcon className="w-16 h-16" />
                          </div>
                        )}
                      </div>
                      {saveError && (
                        <div className="text-[11px] text-red-300 px-3 py-2 border-t border-red-500/20 bg-red-500/5">
                          {saveError}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Machines Section */}
            {(() => {
              const status = props.machineStatus[laundry.id];
              const machines = status?.machines || [];
              const isExpanded = expandedMachines[laundry.id] ?? false;
              const washers = machines.filter(m => m.type === 'washer');
              const dryers = machines.filter(m => m.type === 'dryer');
              const runningCount = machines.filter(m => m.status === 'running').length;

              if (machines.length === 0) return null;

              return (
                <div className="space-y-3">
                  <button
                    onClick={() => toggleMachines(laundry.id)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-xs uppercase tracking-wide text-slate-400">
                      Machines
                    </span>
                    <span className="text-xs text-slate-500">
                      ({runningCount}/{machines.length} running)
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {/* Washers */}
                      {washers.length > 0 && (
                        <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <WashingMachine className="w-4 h-4 text-blue-400" />
                            <span>Washers</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {washers.map(machine => (
                              <div
                                key={machine.id}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-xs ${
                                  machine.status === 'running'
                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                                    : machine.status === 'idle'
                                    ? 'border-slate-600 bg-slate-800/50 text-slate-400'
                                    : 'border-slate-700 bg-slate-900/50 text-slate-500'
                                }`}
                                title={machine.reason ? `Detection: ${machine.reason}` : undefined}
                              >
                                <span>{machine.label}</span>
                                <div className="flex items-center gap-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                                    machine.status === 'running'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : machine.status === 'idle'
                                      ? 'bg-slate-700 text-slate-400'
                                      : 'bg-slate-800 text-slate-500'
                                  }`}>
                                    {machine.status}
                                  </span>
                                  {machine.reason && (
                                    <span className="text-[9px] text-slate-500">
                                      ({machine.reason})
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dryers */}
                      {dryers.length > 0 && (
                        <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Wind className="w-4 h-4 text-orange-400" />
                            <span>Dryers</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {dryers.map(machine => (
                              <div
                                key={machine.id}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-xs ${
                                  machine.status === 'running'
                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                                    : machine.status === 'idle'
                                    ? 'border-slate-600 bg-slate-800/50 text-slate-400'
                                    : 'border-slate-700 bg-slate-900/50 text-slate-500'
                                }`}
                                title={machine.reason ? `Detection: ${machine.reason}` : undefined}
                              >
                                <span>{machine.label}</span>
                                <div className="flex items-center gap-1">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                                    machine.status === 'running'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : machine.status === 'idle'
                                      ? 'bg-slate-700 text-slate-400'
                                      : 'bg-slate-800 text-slate-500'
                                  }`}>
                                    {machine.status}
                                  </span>
                                  {machine.reason && (
                                    <span className="text-[9px] text-slate-500">
                                      ({machine.reason})
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  </div>
  );
};
