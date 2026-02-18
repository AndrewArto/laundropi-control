OpenAI Codex v0.101.0 (research preview)
--------
workdir: /Users/andery-mini/.openclaw/workspace/laundropi-control
model: gpt-5.3-codex
provider: openai
approval: never
sandbox: read-only
reasoning effort: xhigh
reasoning summaries: auto
session id: 019c68c6-6053-74e3-b904-8910d10eeac3
--------
user
Code review this git diff for the Speed Queen Insights API integration into LaundroPi Control. Focus on: 1) Bugs & logic errors 2) Security issues (API keys, auth) 3) Performance 4) Code quality 5) Missing tests. Be concise.

diff --git a/.env.central.example b/.env.central.example
index 8274d65..0c4d09a 100644
--- a/.env.central.example
+++ b/.env.central.example
@@ -26,3 +26,12 @@ CAMERA_FRAME_MIN_INTERVAL_MS=5000
 CAMERA_ALLOW_NON_RTSP=false
 # Fact.pt API key for invoice generation (Finance > Faturas tab)
 FACTPT_API_KEY=
+# Speed Queen Insights API (replaces camera-based machine detection)
+# Get API key from Speed Queen Insights portal
+SPEEDQUEEN_API_KEY=
+# Comma-separated Speed Queen location IDs (e.g., loc_d23f6c,loc_7b105b)
+SPEEDQUEEN_LOCATIONS=
+# Optional: REST polling fallback interval when WebSocket disconnects (ms, default 60000)
+SPEEDQUEEN_POLL_INTERVAL_MS=60000
+# Set to true to use mock Speed Queen API (simulated machines for local dev)
+SPEEDQUEEN_MOCK=false
diff --git a/components/MachineDetailPanel.tsx b/components/MachineDetailPanel.tsx
new file mode 100644
index 0000000..a89f9a3
--- /dev/null
+++ b/components/MachineDetailPanel.tsx
@@ -0,0 +1,278 @@
+import React, { useState, useEffect, useCallback } from 'react';
+import { X, Play, Square, AlertTriangle, Ban, Clock, DoorOpen, DoorClosed, Loader2, CheckCircle, XCircle, WashingMachine, Wind } from 'lucide-react';
+import { LaundryMachine, SpeedQueenMachineCycle, SpeedQueenCommandType } from '../types';
+import { ApiService } from '../services/api';
+
+interface MachineDetailPanelProps {
+  agentId: string;
+  machine: LaundryMachine;
+  onClose: () => void;
+  isSpeedQueen: boolean;
+  isViewer: boolean;
+}
+
+type CommandFeedback = {
+  status: 'pending' | 'success' | 'failed';
+  message: string;
+};
+
+const formatTime = (seconds: number): string => {
+  if (seconds <= 0) return '0:00';
+  const m = Math.floor(seconds / 60);
+  const s = seconds % 60;
+  return `${m}:${String(s).padStart(2, '0')}`;
+};
+
+export const MachineDetailPanel: React.FC<MachineDetailPanelProps> = ({
+  agentId,
+  machine,
+  onClose,
+  isSpeedQueen,
+  isViewer,
+}) => {
+  const [cycles, setCycles] = useState<SpeedQueenMachineCycle[]>([]);
+  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
+  const [loading, setLoading] = useState(false);
+  const [commandFeedback, setCommandFeedback] = useState<CommandFeedback | null>(null);
+  const [remainingSeconds, setRemainingSeconds] = useState(machine.remainingSeconds ?? 0);
+
+  // Fetch machine detail & cycles when panel opens
+  useEffect(() => {
+    if (!isSpeedQueen) return;
+    setLoading(true);
+    ApiService.getMachineDetail(agentId, machine.id)
+      .then((data) => {
+        setCycles(data.cycles || []);
+        if (data.cycles?.length > 0 && !selectedCycleId) {
+          setSelectedCycleId(data.cycles[0].id);
+        }
+      })
+      .catch((err) => {
+        console.error('Failed to load machine detail:', err);
+      })
+      .finally(() => setLoading(false));
+  }, [agentId, machine.id, isSpeedQueen]);
+
+  // Countdown timer for remaining seconds
+  useEffect(() => {
+    setRemainingSeconds(machine.remainingSeconds ?? 0);
+  }, [machine.remainingSeconds]);
+
+  useEffect(() => {
+    if (remainingSeconds <= 0) return;
+    const timer = setInterval(() => {
+      setRemainingSeconds((prev) => Math.max(0, prev - 1));
+    }, 1000);
+    return () => clearInterval(timer);
+  }, [remainingSeconds > 0]);
+
+  const sendCommand = useCallback(async (commandType: SpeedQueenCommandType, params?: Record<string, unknown>) => {
+    setCommandFeedback({ status: 'pending', message: 'Sending command...' });
+    try {
+      const result = await ApiService.sendMachineCommand(agentId, machine.id, commandType, params);
+      if (result.ok) {
+        setCommandFeedback({ status: 'success', message: 'Command sent successfully' });
+      } else {
+        setCommandFeedback({ status: 'failed', message: 'Command failed' });
+      }
+    } catch (err: any) {
+      setCommandFeedback({ status: 'failed', message: err.message || 'Command failed' });
+    }
+    // Clear feedback after 4s
+    setTimeout(() => setCommandFeedback(null), 4000);
+  }, [agentId, machine.id]);
+
+  const statusColor = {
+    idle: 'text-slate-400 border-slate-600',
+    running: 'text-emerald-300 border-emerald-500',
+    error: 'text-red-300 border-red-500',
+    out_of_order: 'text-amber-300 border-amber-500',
+    unknown: 'text-slate-500 border-slate-700',
+  }[machine.status] || 'text-slate-500 border-slate-700';
+
+  const statusBg = {
+    idle: 'bg-slate-500/10',
+    running: 'bg-emerald-500/10',
+    error: 'bg-red-500/10',
+    out_of_order: 'bg-amber-500/10',
+    unknown: 'bg-slate-800/50',
+  }[machine.status] || 'bg-slate-800/50';
+
+  return (
+    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
+      <div
+        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
+        onClick={(e) => e.stopPropagation()}
+      >
+        {/* Header */}
+        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
+          <div className="flex items-center gap-2">
+            {machine.type === 'washer' ? (
+              <WashingMachine className="w-5 h-5 text-blue-400" />
+            ) : (
+              <Wind className="w-5 h-5 text-orange-400" />
+            )}
+            <span className="text-white font-semibold">{machine.label}</span>
+            {machine.model && (
+              <span className="text-xs text-slate-500">({machine.model})</span>
+            )}
+          </div>
+          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
+            <X className="w-5 h-5" />
+          </button>
+        </div>
+
+        {/* Status Section */}
+        <div className="px-4 py-3 space-y-3">
+          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusColor} ${statusBg}`}>
+            <span className="text-sm font-medium uppercase">{machine.status}</span>
+            {machine.status === 'running' && remainingSeconds > 0 && (
+              <div className="flex items-center gap-1 ml-auto text-emerald-300">
+                <Clock className="w-4 h-4" />
+                <span className="text-sm font-mono">{formatTime(remainingSeconds)}</span>
+              </div>
+            )}
+          </div>
+
+          {/* Detail rows */}
+          {isSpeedQueen && (
+            <div className="grid grid-cols-2 gap-2 text-sm">
+              <div className="flex items-center gap-2 text-slate-400">
+                {machine.isDoorOpen ? (
+                  <DoorOpen className="w-4 h-4 text-amber-400" />
+                ) : (
+                  <DoorClosed className="w-4 h-4 text-slate-500" />
+                )}
+                <span>Door: {machine.isDoorOpen ? 'Open' : 'Closed'}</span>
+              </div>
+              {machine.selectedCycle && (
+                <div className="text-slate-400">
+                  Cycle: <span className="text-slate-200">{machine.selectedCycle.name}</span>
+                </div>
+              )}
+              {machine.remainingVend !== undefined && machine.remainingVend > 0 && (
+                <div className="text-slate-400">
+                  Remaining vend: <span className="text-slate-200">{(machine.remainingVend / 100).toFixed(2)}</span>
+                </div>
+              )}
+              {machine.speedqueenId && (
+                <div className="text-slate-500 text-xs col-span-2">
+                  SQ ID: {machine.speedqueenId}
+                </div>
+              )}
+            </div>
+          )}
+
+          {/* Error details */}
+          {machine.status === 'error' && (machine.errorName || machine.errorCode) && (
+            <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2 text-sm">
+              <div className="flex items-center gap-2 text-red-300">
+                <AlertTriangle className="w-4 h-4" />
+                <span>Error: {machine.errorName || `Code ${machine.errorCode}`}</span>
+              </div>
+              {machine.errorType && (
+                <div className="text-red-400 text-xs mt-1">Type: {machine.errorType}</div>
+              )}
+            </div>
+          )}
+        </div>
+
+        {/* Actions Section */}
+        {isSpeedQueen && !isViewer && (
+          <div className="px-4 py-3 border-t border-slate-700 space-y-3">
+            <div className="text-xs uppercase tracking-wide text-slate-400">Actions</div>
+
+            {/* AVAILABLE state: Start Cycle */}
+            {machine.status === 'idle' && (
+              <div className="space-y-2">
+                {cycles.length > 0 && (
+                  <div className="flex items-center gap-2">
+                    <select
+                      value={selectedCycleId}
+                      onChange={(e) => setSelectedCycleId(e.target.value)}
+                      className="flex-1 bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-md px-3 py-2 focus:border-indigo-500 focus:outline-none"
+                    >
+                      {cycles.map((c) => (
+                        <option key={c.id} value={c.id}>
+                          {c.name}{c.vendPrice ? ` (${(c.vendPrice / 100).toFixed(2)})` : ''}
+                        </option>
+                      ))}
+                    </select>
+                  </div>
+                )}
+                <button
+                  onClick={() => sendCommand('remote_start', selectedCycleId ? { cycleId: selectedCycleId } : undefined)}
+                  disabled={commandFeedback?.status === 'pending'}
+                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
+                >
+                  <Play className="w-4 h-4" />
+                  Start Cycle
+                </button>
+              </div>
+            )}
+
+            {/* IN_USE state: Show timer + Stop */}
+            {machine.status === 'running' && (
+              <button
+                onClick={() => sendCommand('remote_stop')}
+                disabled={commandFeedback?.status === 'pending'}
+                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
+              >
+                <Square className="w-4 h-4" />
+                Stop
+              </button>
+            )}
+
+            {/* ERROR state: Clear Error */}
+            {machine.status === 'error' && (
+              <button
+                onClick={() => sendCommand('clear_error')}
+                disabled={commandFeedback?.status === 'pending'}
+                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
+              >
+                <AlertTriangle className="w-4 h-4" />
+                Clear Error
+              </button>
+            )}
+
+            {/* Any state: Out of Order toggle */}
+            <button
+              onClick={() => sendCommand('set_out_of_order')}
+              disabled={commandFeedback?.status === 'pending'}
+              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white text-sm disabled:opacity-50"
+            >
+              <Ban className="w-4 h-4" />
+              {machine.status === 'out_of_order' ? 'Remove Out of Order' : 'Set Out of Order'}
+            </button>
+
+            {/* Command feedback */}
+            {commandFeedback && (
+              <div
+                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
+                  commandFeedback.status === 'pending'
+                    ? 'bg-slate-700/50 text-slate-300'
+                    : commandFeedback.status === 'success'
+                    ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
+                    : 'bg-red-500/10 border border-red-500/40 text-red-300'
+                }`}
+              >
+                {commandFeedback.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin" />}
+                {commandFeedback.status === 'success' && <CheckCircle className="w-4 h-4" />}
+                {commandFeedback.status === 'failed' && <XCircle className="w-4 h-4" />}
+                <span>{commandFeedback.message}</span>
+              </div>
+            )}
+          </div>
+        )}
+
+        {/* Loading */}
+        {loading && (
+          <div className="flex items-center justify-center py-4 text-slate-400 text-sm">
+            <Loader2 className="w-4 h-4 animate-spin mr-2" />
+            Loading details...
+          </div>
+        )}
+      </div>
+    </div>
+  );
+};
diff --git a/components/views/DashboardView.tsx b/components/views/DashboardView.tsx
index 6c1a9fc..982719f 100644
--- a/components/views/DashboardView.tsx
+++ b/components/views/DashboardView.tsx
@@ -1,6 +1,7 @@
 import React, { useState } from 'react';
-import { LayoutDashboard, Server, Cpu, Pencil, Camera as CameraIcon, CameraOff as CameraOffIcon, ChevronDown, ChevronRight, WashingMachine, Wind } from 'lucide-react';
+import { LayoutDashboard, Server, Cpu, Pencil, Camera as CameraIcon, CameraOff as CameraOffIcon, ChevronDown, ChevronRight, WashingMachine, Wind, Clock } from 'lucide-react';
 import RelayCard from '../RelayCard';
+import { MachineDetailPanel } from '../MachineDetailPanel';
 import { Relay, CameraConfig, LaundryMachine, LaundryMachineStatus, UiUser } from '../../types';
 
 interface Laundry {
@@ -50,8 +51,76 @@ interface DashboardViewProps {
   machineStatus: Record<string, LaundryMachineStatus>;
 }
 
+const formatTimeShort = (seconds: number): string => {
+  if (seconds <= 0) return '';
+  const m = Math.floor(seconds / 60);
+  const s = seconds % 60;
+  return `${m}:${String(s).padStart(2, '0')}`;
+};
+
+const machineStatusStyle = (status: string) => {
+  switch (status) {
+    case 'running':
+      return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200';
+    case 'idle':
+      return 'border-slate-600 bg-slate-800/50 text-slate-400';
+    case 'error':
+      return 'border-red-500/50 bg-red-500/10 text-red-200';
+    case 'out_of_order':
+      return 'border-amber-500/50 bg-amber-500/10 text-amber-200';
+    default:
+      return 'border-slate-700 bg-slate-900/50 text-slate-500';
+  }
+};
+
+const machineStatusBadgeStyle = (status: string) => {
+  switch (status) {
+    case 'running':
+      return 'bg-emerald-500/20 text-emerald-300';
+    case 'idle':
+      return 'bg-slate-700 text-slate-400';
+    case 'error':
+      return 'bg-red-500/20 text-red-300';
+    case 'out_of_order':
+      return 'bg-amber-500/20 text-amber-300';
+    default:
+      return 'bg-slate-800 text-slate-500';
+  }
+};
+
+const MachineCard: React.FC<{
+  machine: LaundryMachine;
+  isSpeedQueen: boolean;
+  onClick: () => void;
+}> = ({ machine, isSpeedQueen, onClick }) => (
+  <button
+    onClick={onClick}
+    className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-xs text-left w-full transition-colors hover:brightness-110 ${machineStatusStyle(machine.status)}`}
+    title={machine.reason ? `Detection: ${machine.reason}` : isSpeedQueen ? 'Click for details' : undefined}
+  >
+    <span>{machine.label}</span>
+    <div className="flex items-center gap-1">
+      {isSpeedQueen && machine.status === 'running' && (machine.remainingSeconds ?? 0) > 0 && (
+        <span className="flex items-center gap-0.5 text-emerald-300 text-[10px]">
+          <Clock className="w-3 h-3" />
+          {formatTimeShort(machine.remainingSeconds!)}
+        </span>
+      )}
+      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${machineStatusBadgeStyle(machine.status)}`}>
+        {machine.status === 'out_of_order' ? 'OOO' : machine.status}
+      </span>
+      {!isSpeedQueen && machine.reason && (
+        <span className="text-[9px] text-slate-500">
+          ({machine.reason})
+        </span>
+      )}
+    </div>
+  </button>
+);
+
 export const DashboardView: React.FC<DashboardViewProps> = (props) => {
   const [expandedMachines, setExpandedMachines] = useState<Record<string, boolean>>({});
+  const [selectedMachine, setSelectedMachine] = useState<{ agentId: string; machine: LaundryMachine } | null>(null);
   const isViewer = props.authUser?.role === 'viewer';
 
   const toggleMachines = (agentId: string) => {
@@ -282,6 +351,7 @@ export const DashboardView: React.FC<DashboardViewProps> = (props) => {
               const washers = machines.filter(m => m.type === 'washer');
               const dryers = machines.filter(m => m.type === 'dryer');
               const runningCount = machines.filter(m => m.status === 'running').length;
+              const isSpeedQueen = status?.source === 'speedqueen';
 
               if (machines.length === 0) return null;
 
@@ -302,6 +372,11 @@ export const DashboardView: React.FC<DashboardViewProps> = (props) => {
                     <span className="text-xs text-slate-500">
                       ({runningCount}/{machines.length} running)
                     </span>
+                    {isSpeedQueen && (
+                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-400 text-indigo-300 bg-indigo-500/10">
+                        SQ
+                      </span>
+                    )}
                   </button>
 
                   {isExpanded && (
@@ -315,35 +390,12 @@ export const DashboardView: React.FC<DashboardViewProps> = (props) => {
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                             {washers.map(machine => (
-                              <div
+                              <MachineCard
                                 key={machine.id}
-                                className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-xs ${
-                                  machine.status === 'running'
-                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
-                                    : machine.status === 'idle'
-                                    ? 'border-slate-600 bg-slate-800/50 text-slate-400'
-                                    : 'border-slate-700 bg-slate-900/50 text-slate-500'
-                                }`}
-                                title={machine.reason ? `Detection: ${machine.reason}` : undefined}
-                              >
-                                <span>{machine.label}</span>
-                                <div className="flex items-center gap-1">
-                                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
-                                    machine.status === 'running'
-                                      ? 'bg-emerald-500/20 text-emerald-300'
-                                      : machine.status === 'idle'
-                                      ? 'bg-slate-700 text-slate-400'
-                                      : 'bg-slate-800 text-slate-500'
-                                  }`}>
-                                    {machine.status}
-                                  </span>
-                                  {machine.reason && (
-                                    <span className="text-[9px] text-slate-500">
-                                      ({machine.reason})
-                                    </span>
-                                  )}
-                                </div>
-                              </div>
+                                machine={machine}
+                                isSpeedQueen={isSpeedQueen}
+                                onClick={() => setSelectedMachine({ agentId: laundry.id, machine })}
+                              />
                             ))}
                           </div>
                         </div>
@@ -358,35 +410,12 @@ export const DashboardView: React.FC<DashboardViewProps> = (props) => {
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                             {dryers.map(machine => (
-                              <div
+                              <MachineCard
                                 key={machine.id}
-                                className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-xs ${
-                                  machine.status === 'running'
-                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
-                                    : machine.status === 'idle'
-                                    ? 'border-slate-600 bg-slate-800/50 text-slate-400'
-                                    : 'border-slate-700 bg-slate-900/50 text-slate-500'
-                                }`}
-                                title={machine.reason ? `Detection: ${machine.reason}` : undefined}
-                              >
-                                <span>{machine.label}</span>
-                                <div className="flex items-center gap-1">
-                                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
-                                    machine.status === 'running'
-                                      ? 'bg-emerald-500/20 text-emerald-300'
-                                      : machine.status === 'idle'
-                                      ? 'bg-slate-700 text-slate-400'
-                                      : 'bg-slate-800 text-slate-500'
-                                  }`}>
-                                    {machine.status}
-                                  </span>
-                                  {machine.reason && (
-                                    <span className="text-[9px] text-slate-500">
-                                      ({machine.reason})
-                                    </span>
-                                  )}
-                                </div>
-                              </div>
+                                machine={machine}
+                                isSpeedQueen={isSpeedQueen}
+                                onClick={() => setSelectedMachine({ agentId: laundry.id, machine })}
+                              />
                             ))}
                           </div>
                         </div>
@@ -400,6 +429,17 @@ export const DashboardView: React.FC<DashboardViewProps> = (props) => {
         );
       })}
     </div>
+
+    {/* Machine Detail Panel */}
+    {selectedMachine && (
+      <MachineDetailPanel
+        agentId={selectedMachine.agentId}
+        machine={selectedMachine.machine}
+        onClose={() => setSelectedMachine(null)}
+        isSpeedQueen={props.machineStatus[selectedMachine.agentId]?.source === 'speedqueen'}
+        isViewer={isViewer}
+      />
+    )}
   </div>
   );
 };
diff --git a/services/api.ts b/services/api.ts
index cc7588c..4635528 100644
--- a/services/api.ts
+++ b/services/api.ts
@@ -1,5 +1,5 @@
 
-import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, RevenueDeduction, UiUser, CameraConfig, ExpenditureImport, ExpenditureTransaction, ExpenditureAudit, LaundryMachineStatus } from '../types';
+import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, RevenueDeduction, UiUser, CameraConfig, ExpenditureImport, ExpenditureTransaction, ExpenditureAudit, LaundryMachineStatus, SpeedQueenMachineDetail, SpeedQueenMachineCycle, SpeedQueenCommandType } from '../types';
 
 type LocationLike = { hostname: string; port: string; protocol: string };
 
@@ -520,4 +520,39 @@ export const ApiService = {
     const res = await request(`${API_BASE}/expenditure/deductions?${query.toString()}`);
     return await res.json();
   },
+
+  // ========== Speed Queen Integration ==========
+
+  async getSpeedQueenStatus(): Promise<{ enabled: boolean; active: boolean; locations: string[] }> {
+    const res = await request(`${API_BASE}/speedqueen/status`);
+    return await res.json();
+  },
+
+  async getMachineDetail(agentId: string, machineId: string): Promise<{
+    machine: SpeedQueenMachineDetail;
+    cycles: SpeedQueenMachineCycle[];
+    locationId: string;
+    speedqueenId: string;
+    model: string;
+  }> {
+    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/machines/${encodeURIComponent(machineId)}/detail`);
+    return await res.json();
+  },
+
+  async sendMachineCommand(agentId: string, machineId: string, commandType: SpeedQueenCommandType, params?: Record<string, unknown>): Promise<{
+    ok: boolean;
+    command: { id: string; status?: string };
+  }> {
+    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/machines/${encodeURIComponent(machineId)}/command`, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ commandType, params }),
+    });
+    return await res.json();
+  },
+
+  async getMachineCommandStatus(agentId: string, machineId: string, commandId: string): Promise<{ id: string; status?: string }> {
+    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/machines/${encodeURIComponent(machineId)}/command/${encodeURIComponent(commandId)}`);
+    return await res.json();
+  },
 };
diff --git a/src/server/__tests__/speedqueen-api.test.ts b/src/server/__tests__/speedqueen-api.test.ts
new file mode 100644
index 0000000..b790e92
--- /dev/null
+++ b/src/server/__tests__/speedqueen-api.test.ts
@@ -0,0 +1,126 @@
+import request from 'supertest';
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+const setupApp = async (overrides: Record<string, string | undefined> = {}) => {
+  vi.resetModules();
+  process.env.NODE_ENV = 'test';
+  process.env.CENTRAL_DB_PATH = ':memory:';
+  process.env.CENTRAL_ENV_FILE = '/dev/null';
+  process.env.ALLOW_INSECURE = 'true';
+  process.env.CORS_ORIGINS = 'http://localhost';
+  process.env.REQUIRE_CORS_ORIGINS = 'false';
+  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
+  process.env.AGENT_SECRETS = '';
+  process.env.LAUNDRY_IDS = '';
+  // Do NOT set SPEEDQUEEN_API_KEY — SQ disabled by default
+  delete process.env.SPEEDQUEEN_API_KEY;
+  delete process.env.SPEEDQUEEN_LOCATIONS;
+  Object.entries(overrides).forEach(([key, value]) => {
+    if (value === undefined) {
+      delete process.env[key];
+    } else {
+      process.env[key] = value;
+    }
+  });
+  const mod = await import('../index');
+  return mod.app as import('express').Express;
+};
+
+describe('Speed Queen API Endpoints', () => {
+  describe('GET /api/speedqueen/status', () => {
+    it('returns disabled when no API key configured', async () => {
+      const app = await setupApp();
+      const res = await request(app).get('/api/speedqueen/status').expect(200);
+      expect(res.body.enabled).toBe(false);
+      expect(res.body.active).toBe(false);
+      expect(res.body.locations).toEqual([]);
+    });
+  });
+
+  describe('GET /api/agents/:id/machines (with source field)', () => {
+    it('returns machines with source=camera when SQ disabled', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
+      const res = await request(app).get('/api/agents/Brandoa1/machines').expect(200);
+      expect(res.body.agentId).toBe('Brandoa1');
+      expect(res.body.source).toBe('camera');
+      expect(res.body.machines).toBeDefined();
+      expect(Array.isArray(res.body.machines)).toBe(true);
+    });
+
+    it('returns default machines with unknown status', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
+      const res = await request(app).get('/api/agents/Brandoa1/machines').expect(200);
+      const machines = res.body.machines;
+      expect(machines.length).toBeGreaterThan(0);
+      machines.forEach((m: any) => {
+        expect(m.status).toBe('unknown');
+        expect(m.id).toBeDefined();
+        expect(m.label).toBeDefined();
+        expect(m.type).toMatch(/^(washer|dryer)$/);
+      });
+    });
+  });
+
+  describe('POST /api/agents/:id/machines (camera-based update)', () => {
+    it('accepts camera-based status update', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
+      const res = await request(app)
+        .post('/api/agents/Brandoa1/machines')
+        .send({
+          machines: [
+            { id: 'w1', label: 'Washer 1', type: 'washer', status: 'running' },
+          ],
+        })
+        .expect(200);
+      expect(res.body.ok).toBe(true);
+
+      // Verify cached
+      const getRes = await request(app).get('/api/agents/Brandoa1/machines').expect(200);
+      expect(getRes.body.machines[0].status).toBe('running');
+      expect(getRes.body.source).toBe('camera');
+    });
+
+    it('returns 400 for missing machines array', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
+      await request(app)
+        .post('/api/agents/Brandoa1/machines')
+        .send({})
+        .expect(400);
+    });
+  });
+
+  describe('Machine detail endpoint (SQ disabled)', () => {
+    it('returns 400 when Speed Queen not configured', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
+      const res = await request(app)
+        .get('/api/agents/Brandoa1/machines/w1/detail')
+        .expect(400);
+      expect(res.body.error).toContain('Speed Queen integration not configured');
+    });
+  });
+
+  describe('Machine command endpoint (SQ disabled)', () => {
+    it('returns 400 when Speed Queen not configured', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa1' });
+      const res = await request(app)
+        .post('/api/agents/Brandoa1/machines/w1/command')
+        .send({ commandType: 'remote_start' })
+        .expect(400);
+      expect(res.body.error).toContain('Speed Queen integration not configured');
+    });
+  });
+
+  describe('Backward compatibility', () => {
+    it('still serves Brandoa2 default machines when SQ disabled', async () => {
+      const app = await setupApp({ LAUNDRY_IDS: 'Brandoa2' });
+      const res = await request(app).get('/api/agents/Brandoa2/machines').expect(200);
+      const machines = res.body.machines;
+      // Brandoa2 has 4 washers + 6 dryers = 10
+      expect(machines).toHaveLength(10);
+      const washers = machines.filter((m: any) => m.type === 'washer');
+      const dryers = machines.filter((m: any) => m.type === 'dryer');
+      expect(washers).toHaveLength(4);
+      expect(dryers).toHaveLength(6);
+    });
+  });
+});
diff --git a/src/server/__tests__/speedqueen-lazy.test.ts b/src/server/__tests__/speedqueen-lazy.test.ts
new file mode 100644
index 0000000..192cd1a
--- /dev/null
+++ b/src/server/__tests__/speedqueen-lazy.test.ts
@@ -0,0 +1,197 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
+
+// Mock fetch globally before importing the module
+const mockFetch = vi.fn();
+global.fetch = mockFetch as any;
+
+// Mock WebSocket
+vi.mock('ws', () => {
+  const EventEmitter = require('events');
+  class MockWebSocket extends EventEmitter {
+    static OPEN = 1;
+    static CLOSED = 3;
+    readyState = 1;
+    send = vi.fn();
+    close = vi.fn();
+    constructor() {
+      super();
+      setTimeout(() => this.emit('open'), 0);
+    }
+  }
+  return { WebSocket: MockWebSocket };
+});
+
+import {
+  SpeedQueenService,
+  STATUS_CACHE_TTL_MS,
+  WS_IDLE_TIMEOUT_MS,
+} from '../services/speedqueen';
+import type { LaundryMachine } from '../../../types';
+
+describe('SpeedQueenService — lazy WebSocket & caching', () => {
+  let service: SpeedQueenService;
+  let statusUpdates: Array<{ agentId: string; machines: LaundryMachine[] }>;
+
+  beforeEach(() => {
+    mockFetch.mockReset();
+    statusUpdates = [];
+    service = new SpeedQueenService(
+      'test-key',
+      'loc_d23f6c,loc_7b105b',
+      (agentId, machines) => {
+        statusUpdates.push({ agentId, machines: [...machines] });
+      },
+    );
+  });
+
+  afterEach(() => {
+    service.stop();
+  });
+
+  describe('constants', () => {
+    it('exports cache TTL of 30 seconds', () => {
+      expect(STATUS_CACHE_TTL_MS).toBe(30_000);
+    });
+
+    it('exports WS idle timeout of 60 seconds', () => {
+      expect(WS_IDLE_TIMEOUT_MS).toBe(60_000);
+    });
+  });
+
+  describe('start() — no immediate connections', () => {
+    it('does not connect WebSocket on start()', async () => {
+      await service.start();
+      expect(service.isActive()).toBe(true);
+
+      // No fetch calls should have been made (no REST poll, no WS token)
+      expect(mockFetch).not.toHaveBeenCalled();
+    });
+
+    it('does not poll locations on start()', async () => {
+      await service.start();
+      // getMachines returns empty because no poll occurred
+      expect(service.getMachines('Brandoa1')).toEqual([]);
+      expect(service.getMachines('Brandoa2')).toEqual([]);
+    });
+  });
+
+  describe('notifyUiActivity() — triggers lazy WS', () => {
+    it('triggers WebSocket connection on first UI activity', async () => {
+      // Mock the realtime token endpoint
+      mockFetch.mockImplementation(async (url: string) => {
+        if (url.includes('/v1/realtime/auth')) {
+          return {
+            ok: true,
+            json: () => Promise.resolve({ token: 'mock-ws-token' }),
+          };
+        }
+        if (url.includes('/v1/locations/') && url.includes('/machines')) {
+          return {
+            ok: true,
+            headers: new Headers({ 'content-type': 'application/json' }),
+            json: () => Promise.resolve([
+              {
+                id: 'mac_1096b5',
+                status: { status: 'AVAILABLE', remainingSeconds: 0 },
+              },
+            ]),
+          };
+        }
+        return { ok: true, headers: new Headers(), json: () => Promise.resolve({}) };
+      });
+
+      await service.start();
+      expect(mockFetch).not.toHaveBeenCalled();
+
+      // Trigger UI activity
+      service.notifyUiActivity();
+
+      // Wait for async connection + poll
+      await new Promise(resolve => setTimeout(resolve, 200));
+
+      // Should have attempted to get realtime token (WS connect)
+      const tokenCalls = mockFetch.mock.calls.filter(
+        (c: any) => c[0].includes('/v1/realtime/auth'),
+      );
+      expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
+    });
+  });
+
+  describe('getMachinesOnDemand() — cache TTL', () => {
+    it('fetches fresh data when cache is empty', async () => {
+      mockFetch.mockImplementation(async (url: string) => {
+        if (url.includes('/machines')) {
+          return {
+            ok: true,
+            headers: new Headers({ 'content-type': 'application/json' }),
+            json: () => Promise.resolve([
+              {
+                id: 'mac_1096b5',
+                status: { status: 'IN_USE', remainingSeconds: 600 },
+              },
+            ]),
+          };
+        }
+        return {
+          ok: true,
+          headers: new Headers({ 'content-type': 'application/json' }),
+          json: () => Promise.resolve({}),
+        };
+      });
+
+      await service.start();
+      const machines = await service.getMachinesOnDemand('Brandoa1');
+
+      expect(machines.length).toBeGreaterThan(0);
+      expect(machines[0].status).toBe('running');
+    });
+
+    it('returns cached data within TTL', async () => {
+      let callCount = 0;
+      mockFetch.mockImplementation(async (url: string) => {
+        if (url.includes('/machines')) {
+          callCount++;
+          return {
+            ok: true,
+            headers: new Headers({ 'content-type': 'application/json' }),
+            json: () => Promise.resolve([
+              {
+                id: 'mac_1096b5',
+                status: { status: 'AVAILABLE', remainingSeconds: 0 },
+              },
+            ]),
+          };
+        }
+        return {
+          ok: true,
+          headers: new Headers({ 'content-type': 'application/json' }),
+          json: () => Promise.resolve({}),
+        };
+      });
+
+      await service.start();
+
+      // First call triggers REST
+      await service.getMachinesOnDemand('Brandoa1');
+      const firstCallCount = callCount;
+
+      // Second call should use cache
+      await service.getMachinesOnDemand('Brandoa1');
+      expect(callCount).toBe(firstCallCount); // no additional REST call
+    });
+
+    it('returns empty array for unknown agent', async () => {
+      await service.start();
+      const machines = await service.getMachinesOnDemand('Unknown');
+      expect(machines).toEqual([]);
+    });
+  });
+
+  describe('stop()', () => {
+    it('cleans up timers and disconnects WS', async () => {
+      await service.start();
+      service.stop();
+      expect(service.isActive()).toBe(false);
+    });
+  });
+});
diff --git a/src/server/__tests__/speedqueen-mock-api.test.ts b/src/server/__tests__/speedqueen-mock-api.test.ts
new file mode 100644
index 0000000..2f0b7f0
--- /dev/null
+++ b/src/server/__tests__/speedqueen-mock-api.test.ts
@@ -0,0 +1,136 @@
+import request from 'supertest';
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+const setupApp = async (overrides: Record<string, string | undefined> = {}) => {
+  vi.resetModules();
+  process.env.NODE_ENV = 'test';
+  process.env.CENTRAL_DB_PATH = ':memory:';
+  process.env.CENTRAL_ENV_FILE = '/dev/null';
+  process.env.ALLOW_INSECURE = 'true';
+  process.env.CORS_ORIGINS = 'http://localhost';
+  process.env.REQUIRE_CORS_ORIGINS = 'false';
+  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
+  process.env.AGENT_SECRETS = '';
+  process.env.LAUNDRY_IDS = '';
+  delete process.env.SPEEDQUEEN_API_KEY;
+  delete process.env.SPEEDQUEEN_LOCATIONS;
+  delete process.env.SPEEDQUEEN_MOCK;
+  Object.entries(overrides).forEach(([key, value]) => {
+    if (value === undefined) {
+      delete process.env[key];
+    } else {
+      process.env[key] = value;
+    }
+  });
+  const mod = await import('../index');
+  return mod;
+};
+
+describe('Speed Queen Mock API', () => {
+  describe('SPEEDQUEEN_MOCK=true', () => {
+    it('enables Speed Queen even without API key', async () => {
+      const { app, initSpeedQueen } = await setupApp({
+        SPEEDQUEEN_MOCK: 'true',
+        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
+      });
+
+      // In tests, initSpeedQueen() must be called explicitly (server.listen doesn't run)
+      initSpeedQueen();
+      await new Promise(resolve => setTimeout(resolve, 100));
+
+      const res = await request(app as any).get('/api/speedqueen/status').expect(200);
+      expect(res.body.enabled).toBe(true);
+      expect(res.body.active).toBe(true);
+    });
+
+    it('returns mock machines for Brandoa1', async () => {
+      const { app, initSpeedQueen } = await setupApp({
+        SPEEDQUEEN_MOCK: 'true',
+        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
+      });
+
+      initSpeedQueen();
+      await new Promise(resolve => setTimeout(resolve, 200));
+
+      const res = await request(app as any).get('/api/agents/Brandoa1/machines').expect(200);
+      expect(res.body.agentId).toBe('Brandoa1');
+      expect(res.body.machines.length).toBe(8);
+      expect(res.body.source).toBe('speedqueen');
+
+      // Verify machine structure
+      const machine = res.body.machines[0];
+      expect(machine).toHaveProperty('id');
+      expect(machine).toHaveProperty('label');
+      expect(machine).toHaveProperty('type');
+      expect(machine).toHaveProperty('status');
+      expect(machine).toHaveProperty('source', 'speedqueen');
+      expect(machine).toHaveProperty('speedqueenId');
+      expect(machine).toHaveProperty('model');
+    });
+
+    it('returns mock machines for Brandoa2', async () => {
+      const { app, initSpeedQueen } = await setupApp({
+        SPEEDQUEEN_MOCK: 'true',
+        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
+      });
+
+      initSpeedQueen();
+      await new Promise(resolve => setTimeout(resolve, 200));
+
+      const res = await request(app as any).get('/api/agents/Brandoa2/machines').expect(200);
+      expect(res.body.machines.length).toBe(10);
+    });
+
+    it('supports machine commands in mock mode', async () => {
+      const { app, initSpeedQueen } = await setupApp({
+        SPEEDQUEEN_MOCK: 'true',
+        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
+      });
+
+      initSpeedQueen();
+      await new Promise(resolve => setTimeout(resolve, 200));
+
+      const res = await request(app as any)
+        .post('/api/agents/Brandoa1/machines/w1/command')
+        .send({ commandType: 'remote_start', params: { cycleId: 'cyc_normal_80' } })
+        .expect(200);
+
+      expect(res.body.ok).toBe(true);
+      expect(res.body.command.id).toMatch(/^mock_cmd_/);
+      expect(res.body.command.status).toBe('completed');
+    });
+
+    it('returns machine detail with mock cycles', async () => {
+      const { app, initSpeedQueen } = await setupApp({
+        SPEEDQUEEN_MOCK: 'true',
+        LAUNDRY_IDS: 'Brandoa1,Brandoa2',
+      });
+
+      initSpeedQueen();
+      await new Promise(resolve => setTimeout(resolve, 200));
+
+      const res = await request(app as any)
+        .get('/api/agents/Brandoa1/machines/w1/detail')
+        .expect(200);
+
+      expect(res.body.machine).toBeDefined();
+      expect(res.body.cycles).toBeDefined();
+      expect(res.body.cycles.length).toBeGreaterThan(0);
+      expect(res.body.locationId).toBe('loc_d23f6c');
+      expect(res.body.speedqueenId).toBe('mac_1096b5');
+      expect(res.body.model).toBe('SY80U');
+    });
+  });
+
+  describe('SPEEDQUEEN_MOCK=false (default)', () => {
+    it('does not enable Speed Queen without API key', async () => {
+      const { app } = await setupApp({
+        SPEEDQUEEN_MOCK: 'false',
+        LAUNDRY_IDS: 'Brandoa1',
+      });
+
+      const res = await request(app as any).get('/api/speedqueen/status').expect(200);
+      expect(res.body.enabled).toBe(false);
+    });
+  });
+});
diff --git a/src/server/__tests__/speedqueen-mock.test.ts b/src/server/__tests__/speedqueen-mock.test.ts
new file mode 100644
index 0000000..4982d99
--- /dev/null
+++ b/src/server/__tests__/speedqueen-mock.test.ts
@@ -0,0 +1,231 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
+
+// Mock WebSocket before importing
+vi.mock('ws', () => {
+  const EventEmitter = require('events');
+  class MockWebSocket extends EventEmitter {
+    static OPEN = 1;
+    static CLOSED = 3;
+    readyState = 1;
+    send = vi.fn();
+    close = vi.fn();
+    constructor() {
+      super();
+      setTimeout(() => this.emit('open'), 0);
+    }
+  }
+  return { WebSocket: MockWebSocket };
+});
+
+import { MockSpeedQueenService } from '../services/speedqueen-mock';
+import type { LaundryMachine } from '../../../types';
+
+describe('MockSpeedQueenService', () => {
+  let service: MockSpeedQueenService;
+  let statusUpdates: Array<{ agentId: string; machines: LaundryMachine[] }>;
+
+  beforeEach(() => {
+    statusUpdates = [];
+    service = new MockSpeedQueenService(
+      'mock-key',
+      'loc_d23f6c,loc_7b105b',
+      (agentId, machines) => {
+        statusUpdates.push({ agentId, machines: [...machines] });
+      },
+    );
+  });
+
+  afterEach(() => {
+    service.stop();
+  });
+
+  describe('initialization', () => {
+    it('creates with correct location mappings', () => {
+      expect(service.isActive()).toBe(false);
+      expect(service.getMachines('Brandoa1')).toEqual([]);
+    });
+
+    it('provides machine mappings for known agents', () => {
+      const mapping = service.getMachineMapping('Brandoa1', 'w1');
+      expect(mapping).toBeDefined();
+      expect(mapping?.speedqueenId).toBe('mac_1096b5');
+      expect(mapping?.model).toBe('SY80U');
+    });
+
+    it('returns undefined for unknown machine mapping', () => {
+      expect(service.getMachineMapping('Brandoa1', 'w99')).toBeUndefined();
+    });
+
+    it('returns location ID for agent', () => {
+      expect(service.getLocationIdForAgent('Brandoa1')).toBe('loc_d23f6c');
+      expect(service.getLocationIdForAgent('Unknown')).toBeUndefined();
+    });
+
+    it('returns all machine mappings for an agent', () => {
+      const b1 = service.getMachineMappingsForAgent('Brandoa1');
+      expect(b1).toHaveLength(8);
+      const b2 = service.getMachineMappingsForAgent('Brandoa2');
+      expect(b2).toHaveLength(10);
+    });
+  });
+
+  describe('start and status updates', () => {
+    it('starts and pushes initial status for all agents', async () => {
+      await service.start();
+      expect(service.isActive()).toBe(true);
+
+      // Should have received status updates for both agents
+      const agents = statusUpdates.map(u => u.agentId);
+      expect(agents).toContain('Brandoa1');
+      expect(agents).toContain('Brandoa2');
+    });
+
+    it('populates machines after start', async () => {
+      await service.start();
+      const b1Machines = service.getMachines('Brandoa1');
+      expect(b1Machines).toHaveLength(8);
+      const b2Machines = service.getMachines('Brandoa2');
+      expect(b2Machines).toHaveLength(10);
+    });
+
+    it('all machines have source=speedqueen', async () => {
+      await service.start();
+      const machines = service.getMachines('Brandoa1');
+      for (const m of machines) {
+        expect(m.source).toBe('speedqueen');
+      }
+    });
+
+    it('machines have valid statuses', async () => {
+      await service.start();
+      const machines = service.getMachines('Brandoa1');
+      const validStatuses = ['idle', 'running', 'error', 'out_of_order', 'unknown'];
+      for (const m of machines) {
+        expect(validStatuses).toContain(m.status);
+      }
+    });
+
+    it('does not start twice', async () => {
+      await service.start();
+      const count1 = statusUpdates.length;
+      await service.start();
+      expect(statusUpdates.length).toBe(count1); // no additional updates
+    });
+  });
+
+  describe('commands', () => {
+    it('remote_start changes machine to running', async () => {
+      await service.start();
+
+      const result = await service.sendMachineCommand('Brandoa1', 'w1', 'remote_start', {
+        cycleId: 'cyc_normal_80',
+      });
+      expect(result.id).toMatch(/^mock_cmd_/);
+      expect(result.status).toBe('completed');
+
+      const machines = service.getMachines('Brandoa1');
+      const w1 = machines.find(m => m.id === 'w1');
+      expect(w1?.status).toBe('running');
+      expect(w1?.selectedCycle?.name).toBe('Normal');
+      expect(w1?.remainingSeconds).toBeGreaterThan(0);
+    });
+
+    it('remote_stop changes machine to idle (end of cycle)', async () => {
+      await service.start();
+
+      // First start the machine
+      await service.sendMachineCommand('Brandoa1', 'w1', 'remote_start');
+      // Then stop it
+      await service.sendMachineCommand('Brandoa1', 'w1', 'remote_stop');
+
+      const machines = service.getMachines('Brandoa1');
+      const w1 = machines.find(m => m.id === 'w1');
+      expect(w1?.status).toBe('idle'); // END_OF_CYCLE maps to idle
+      expect(w1?.remainingSeconds).toBe(0);
+    });
+
+    it('clear_error changes machine to idle', async () => {
+      await service.start();
+      await service.sendMachineCommand('Brandoa1', 'w1', 'clear_error');
+
+      const machines = service.getMachines('Brandoa1');
+      const w1 = machines.find(m => m.id === 'w1');
+      expect(w1?.status).toBe('idle');
+    });
+
+    it('set_out_of_order changes machine to out_of_order', async () => {
+      await service.start();
+      await service.sendMachineCommand('Brandoa1', 'w1', 'set_out_of_order');
+
+      const machines = service.getMachines('Brandoa1');
+      const w1 = machines.find(m => m.id === 'w1');
+      expect(w1?.status).toBe('out_of_order');
+    });
+
+    it('throws for unknown machine', async () => {
+      await service.start();
+      await expect(
+        service.sendMachineCommand('Brandoa1', 'w99', 'remote_start'),
+      ).rejects.toThrow('No Speed Queen mapping');
+    });
+
+    it('getCommandStatus returns completed', async () => {
+      const result = await service.getCommandStatus('Brandoa1', 'w1', 'mock_cmd_123');
+      expect(result.status).toBe('completed');
+    });
+  });
+
+  describe('cycles', () => {
+    it('returns mock cycles for washer', async () => {
+      const cycles = await service.getMachineCycles('Brandoa1', 'w1');
+      expect(cycles.length).toBeGreaterThan(0);
+      expect(cycles[0]).toHaveProperty('id');
+      expect(cycles[0]).toHaveProperty('name');
+      expect(cycles[0]).toHaveProperty('vendPrice');
+      expect(cycles[0]).toHaveProperty('duration');
+    });
+
+    it('returns mock cycles for dryer', async () => {
+      const cycles = await service.getMachineCycles('Brandoa1', 'd5');
+      expect(cycles.length).toBeGreaterThan(0);
+      expect(cycles[0].name).toMatch(/Dry|Heat/);
+    });
+
+    it('returns empty for unknown machine', async () => {
+      const cycles = await service.getMachineCycles('Brandoa1', 'w99');
+      expect(cycles).toEqual([]);
+    });
+
+    it('caches cycles after first call', async () => {
+      const cycles1 = await service.getMachineCycles('Brandoa1', 'w1');
+      const cycles2 = await service.getMachineCycles('Brandoa1', 'w1');
+      expect(cycles1).toBe(cycles2); // same reference (cached)
+    });
+  });
+
+  describe('pollAllLocations', () => {
+    it('updates status via polling', async () => {
+      await service.start();
+      statusUpdates.length = 0;
+
+      await service.pollAllLocations();
+
+      expect(statusUpdates.length).toBeGreaterThan(0);
+    });
+  });
+
+  describe('stop', () => {
+    it('marks service as inactive', async () => {
+      await service.start();
+      expect(service.isActive()).toBe(true);
+      service.stop();
+      expect(service.isActive()).toBe(false);
+    });
+  });
+
+  describe('getRestClient', () => {
+    it('returns null for mock service', () => {
+      expect(service.getRestClient()).toBeNull();
+    });
+  });
+});
diff --git a/src/server/__tests__/speedqueen.test.ts b/src/server/__tests__/speedqueen.test.ts
new file mode 100644
index 0000000..38e285c
--- /dev/null
+++ b/src/server/__tests__/speedqueen.test.ts
@@ -0,0 +1,410 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+
+// Mock fetch globally before importing the module
+const mockFetch = vi.fn();
+global.fetch = mockFetch as any;
+
+// Mock WebSocket
+vi.mock('ws', () => {
+  const EventEmitter = require('events');
+  class MockWebSocket extends EventEmitter {
+    static OPEN = 1;
+    static CLOSED = 3;
+    readyState = 1; // OPEN
+    send = vi.fn();
+    close = vi.fn();
+    constructor() {
+      super();
+      // Simulate open after construction
+      setTimeout(() => this.emit('open'), 0);
+    }
+  }
+  return { WebSocket: MockWebSocket };
+});
+
+import {
+  mapSQStatus,
+  parseLocationConfig,
+  buildMachineMappings,
+  SpeedQueenRestClient,
+  SpeedQueenWSClient,
+  SpeedQueenService,
+  buildCommand,
+  LOCATION_TO_AGENT,
+  BRANDOA1_MACHINES,
+  BRANDOA2_MACHINES,
+} from '../services/speedqueen';
+
+describe('Speed Queen Service', () => {
+  beforeEach(() => {
+    mockFetch.mockReset();
+  });
+
+  // -------------------------------------------------------------------
+  // Status mapping
+  // -------------------------------------------------------------------
+  describe('mapSQStatus', () => {
+    it('maps AVAILABLE to idle', () => {
+      expect(mapSQStatus('AVAILABLE')).toBe('idle');
+    });
+
+    it('maps IN_USE to running', () => {
+      expect(mapSQStatus('IN_USE')).toBe('running');
+    });
+
+    it('maps END_OF_CYCLE to idle', () => {
+      expect(mapSQStatus('END_OF_CYCLE')).toBe('idle');
+    });
+
+    it('maps DIAGNOSTIC to out_of_order', () => {
+      expect(mapSQStatus('DIAGNOSTIC')).toBe('out_of_order');
+    });
+
+    it('maps OUT_OF_ORDER to out_of_order', () => {
+      expect(mapSQStatus('OUT_OF_ORDER')).toBe('out_of_order');
+    });
+
+    it('maps ERROR to error', () => {
+      expect(mapSQStatus('ERROR')).toBe('error');
+    });
+
+    it('maps unknown status to unknown', () => {
+      expect(mapSQStatus('SOMETHING_ELSE')).toBe('unknown');
+      expect(mapSQStatus('')).toBe('unknown');
+    });
+
+    it('is case-insensitive', () => {
+      expect(mapSQStatus('available')).toBe('idle');
+      expect(mapSQStatus('in_use')).toBe('running');
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // Location config parsing
+  // -------------------------------------------------------------------
+  describe('parseLocationConfig', () => {
+    it('parses comma-separated location IDs', () => {
+      const result = parseLocationConfig('loc_d23f6c,loc_7b105b');
+      expect(result).toHaveLength(2);
+      expect(result[0]).toEqual({ locationId: 'loc_d23f6c', agentId: 'Brandoa1' });
+      expect(result[1]).toEqual({ locationId: 'loc_7b105b', agentId: 'Brandoa2' });
+    });
+
+    it('parses location:agentId pairs', () => {
+      const result = parseLocationConfig('loc_d23f6c:MyAgent1');
+      expect(result).toHaveLength(1);
+      expect(result[0]).toEqual({ locationId: 'loc_d23f6c', agentId: 'MyAgent1' });
+    });
+
+    it('handles empty config', () => {
+      expect(parseLocationConfig('')).toEqual([]);
+      expect(parseLocationConfig('  ')).toEqual([]);
+    });
+
+    it('skips unknown location IDs without explicit agentId', () => {
+      const result = parseLocationConfig('loc_unknown');
+      expect(result).toEqual([]);
+    });
+
+    it('trims whitespace', () => {
+      const result = parseLocationConfig(' loc_d23f6c , loc_7b105b ');
+      expect(result).toHaveLength(2);
+      expect(result[0].locationId).toBe('loc_d23f6c');
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // Machine mappings
+  // -------------------------------------------------------------------
+  describe('buildMachineMappings', () => {
+    it('builds Brandoa1 mappings', () => {
+      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
+      expect(mappings).toHaveLength(8);
+      expect(mappings[0].speedqueenId).toBe('mac_1096b5');
+      expect(mappings[0].localId).toBe('w1');
+      expect(mappings[0].type).toBe('washer');
+      expect(mappings[0].agentId).toBe('Brandoa1');
+    });
+
+    it('builds Brandoa2 mappings', () => {
+      const mappings = buildMachineMappings([{ locationId: 'loc_7b105b', agentId: 'Brandoa2' }]);
+      expect(mappings).toHaveLength(10);
+      const dryers = mappings.filter(m => m.type === 'dryer');
+      const washers = mappings.filter(m => m.type === 'washer');
+      expect(dryers).toHaveLength(6);
+      expect(washers).toHaveLength(4);
+    });
+
+    it('returns empty for unknown location', () => {
+      const mappings = buildMachineMappings([{ locationId: 'loc_unknown', agentId: 'Unknown' }]);
+      expect(mappings).toHaveLength(0);
+    });
+
+    it('builds both locations', () => {
+      const mappings = buildMachineMappings([
+        { locationId: 'loc_d23f6c', agentId: 'Brandoa1' },
+        { locationId: 'loc_7b105b', agentId: 'Brandoa2' },
+      ]);
+      expect(mappings).toHaveLength(18); // 8 + 10
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // Hardcoded data consistency
+  // -------------------------------------------------------------------
+  describe('machine data consistency', () => {
+    it('Brandoa1 has 4 washers and 4 dryers', () => {
+      expect(BRANDOA1_MACHINES.filter(m => m.type === 'washer')).toHaveLength(4);
+      expect(BRANDOA1_MACHINES.filter(m => m.type === 'dryer')).toHaveLength(4);
+    });
+
+    it('Brandoa2 has 4 washers and 6 dryers', () => {
+      expect(BRANDOA2_MACHINES.filter(m => m.type === 'washer')).toHaveLength(4);
+      expect(BRANDOA2_MACHINES.filter(m => m.type === 'dryer')).toHaveLength(6);
+    });
+
+    it('all machines have unique speedqueenIds', () => {
+      const allIds = [...BRANDOA1_MACHINES, ...BRANDOA2_MACHINES].map(m => m.speedqueenId);
+      expect(new Set(allIds).size).toBe(allIds.length);
+    });
+
+    it('location mapping is correct', () => {
+      expect(LOCATION_TO_AGENT['loc_d23f6c']).toBe('Brandoa1');
+      expect(LOCATION_TO_AGENT['loc_7b105b']).toBe('Brandoa2');
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // Command building
+  // -------------------------------------------------------------------
+  describe('buildCommand', () => {
+    it('builds remote_start command', () => {
+      const cmd = buildCommand('remote_start', { cycleId: 'cyc_high' });
+      expect(cmd.type).toBe('MachineRemoteStartCommandRequest');
+      expect(cmd.cycleId).toBe('cyc_high');
+    });
+
+    it('builds remote_stop command', () => {
+      const cmd = buildCommand('remote_stop');
+      expect(cmd.type).toBe('MachineRemoteStopCommandRequest');
+    });
+
+    it('builds clear_error command', () => {
+      const cmd = buildCommand('clear_error');
+      expect(cmd.type).toBe('MachineClearErrorCommandRequest');
+    });
+
+    it('builds set_out_of_order command', () => {
+      const cmd = buildCommand('set_out_of_order');
+      expect(cmd.type).toBe('MachineProgramOutOfOrderCommandRequest');
+    });
+
+    it('throws for unknown command type', () => {
+      expect(() => buildCommand('invalid' as any)).toThrow('Unknown command type');
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // REST Client
+  // -------------------------------------------------------------------
+  describe('SpeedQueenRestClient', () => {
+    const client = new SpeedQueenRestClient('test-api-key');
+
+    it('calls getLocations with correct headers', async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        headers: new Headers({ 'content-type': 'application/json' }),
+        json: () => Promise.resolve([{ id: 'loc_1', name: 'Test' }]),
+      });
+
+      const result = await client.getLocations();
+      expect(result).toHaveLength(1);
+      expect(mockFetch).toHaveBeenCalledWith(
+        'https://api.alliancelaundrydigital.com/v1/locations',
+        expect.objectContaining({
+          method: 'GET',
+          headers: expect.objectContaining({
+            'x-api-key': 'test-api-key',
+          }),
+        }),
+      );
+    });
+
+    it('calls getMachines for a location', async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        headers: new Headers({ 'content-type': 'application/json' }),
+        json: () => Promise.resolve([{ id: 'mac_1', status: 'AVAILABLE' }]),
+      });
+
+      const result = await client.getMachines('loc_d23f6c');
+      expect(result).toHaveLength(1);
+      expect(mockFetch).toHaveBeenCalledWith(
+        expect.stringContaining('/v1/locations/loc_d23f6c/machines'),
+        expect.any(Object),
+      );
+    });
+
+    it('sends command to machine', async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        headers: new Headers({ 'content-type': 'application/json' }),
+        json: () => Promise.resolve({ id: 'cmd_123', status: 'pending' }),
+      });
+
+      const result = await client.sendCommand('loc_d23f6c', 'mac_1', { type: 'MachineRemoteStartCommandRequest' });
+      expect(result.id).toBe('cmd_123');
+      expect(mockFetch).toHaveBeenCalledWith(
+        expect.stringContaining('/v1/locations/loc_d23f6c/machines/mac_1/commands'),
+        expect.objectContaining({ method: 'POST' }),
+      );
+    });
+
+    it('throws on non-OK response', async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: false,
+        status: 401,
+        text: () => Promise.resolve('Unauthorized'),
+      });
+
+      await expect(client.getLocations()).rejects.toThrow('Speed Queen API GET /v1/locations failed: 401');
+    });
+
+    it('gets realtime token', async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        json: () => Promise.resolve({ token: 'jwt-test-token' }),
+      });
+
+      const token = await client.getRealtimeToken();
+      expect(token).toBe('jwt-test-token');
+      expect(mockFetch).toHaveBeenCalledWith(
+        expect.stringContaining('/v1/realtime/auth'),
+        expect.objectContaining({
+          method: 'POST',
+          headers: expect.objectContaining({
+            'Authorization': 'test-api-key',
+          }),
+        }),
+      );
+    });
+
+    it('throws when realtime auth returns no token', async () => {
+      mockFetch.mockResolvedValueOnce({
+        ok: true,
+        json: () => Promise.resolve({}),
+      });
+
+      await expect(client.getRealtimeToken()).rejects.toThrow('no token in response');
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // WebSocket Client
+  // -------------------------------------------------------------------
+  describe('SpeedQueenWSClient', () => {
+    it('maps SQ status to LaundryMachine correctly', () => {
+      const restClient = new SpeedQueenRestClient('test-key');
+      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
+      const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);
+
+      const sqStatus = {
+        id: 'mac_1096b5',
+        status: 'IN_USE',
+        remainingSeconds: 1200,
+        remainingVend: 150,
+        isDoorOpen: false,
+        selectedCycle: { id: 'cyc_high', name: 'HIGH' },
+        selectedModifier: null,
+      };
+
+      const result = wsClient.mapSQStatusToLaundryMachine(sqStatus, mappings[0]);
+      expect(result.id).toBe('w1');
+      expect(result.label).toBe('Washer 1');
+      expect(result.type).toBe('washer');
+      expect(result.status).toBe('running');
+      expect(result.source).toBe('speedqueen');
+      expect(result.speedqueenId).toBe('mac_1096b5');
+      expect(result.remainingSeconds).toBe(1200);
+      expect(result.isDoorOpen).toBe(false);
+      expect(result.selectedCycle?.name).toBe('HIGH');
+      expect(result.model).toBe('SY80U');
+    });
+
+    it('handles AVAILABLE status mapping', () => {
+      const restClient = new SpeedQueenRestClient('test-key');
+      const mappings = buildMachineMappings([{ locationId: 'loc_d23f6c', agentId: 'Brandoa1' }]);
+      const wsClient = new SpeedQueenWSClient(restClient, ['loc_d23f6c'], mappings);
+
+      const sqStatus = {
+        id: 'mac_1096b5',
+        status: 'AVAILABLE',
+        remainingSeconds: 0,
+        isDoorOpen: true,
+        selectedCycle: null,
+        selectedModifier: null,
+      };
+
+      const result = wsClient.mapSQStatusToLaundryMachine(sqStatus, mappings[0]);
+      expect(result.status).toBe('idle');
+      expect(result.isDoorOpen).toBe(true);
+      expect(result.remainingSeconds).toBe(0);
+    });
+  });
+
+  // -------------------------------------------------------------------
+  // SpeedQueenService integration
+  // -------------------------------------------------------------------
+  describe('SpeedQueenService', () => {
+    it('initializes with correct location mappings', () => {
+      const statusUpdates: Array<{ agentId: string; count: number }> = [];
+      const service = new SpeedQueenService(
+        'test-key',
+        'loc_d23f6c,loc_7b105b',
+        (agentId, machines) => {
+          statusUpdates.push({ agentId, count: machines.length });
+        },
+      );
+
+      // Check the service was created (it won't start without calling start())
+      expect(service.isActive()).toBe(false);
+      expect(service.getMachines('Brandoa1')).toEqual([]);
+      expect(service.getMachines('Brandoa2')).toEqual([]);
+    });
+
+    it('returns machine mapping for known machine', () => {
+      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
+      const mapping = service.getMachineMapping('Brandoa1', 'w1');
+      expect(mapping).toBeDefined();
+      expect(mapping?.speedqueenId).toBe('mac_1096b5');
+      expect(mapping?.model).toBe('SY80U');
+    });
+
+    it('returns undefined for unknown machine mapping', () => {
+      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
+      const mapping = service.getMachineMapping('Brandoa1', 'w99');
+      expect(mapping).toBeUndefined();
+    });
+
+    it('returns location ID for agent', () => {
+      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
+      expect(service.getLocationIdForAgent('Brandoa1')).toBe('loc_d23f6c');
+      expect(service.getLocationIdForAgent('Unknown')).toBeUndefined();
+    });
+
+    it('returns all machine mappings for an agent', () => {
+      const service = new SpeedQueenService('test-key', 'loc_d23f6c,loc_7b105b', () => {});
+      const b1Mappings = service.getMachineMappingsForAgent('Brandoa1');
+      expect(b1Mappings).toHaveLength(8);
+      const b2Mappings = service.getMachineMappingsForAgent('Brandoa2');
+      expect(b2Mappings).toHaveLength(10);
+    });
+
+    it('throws when sending command for unknown machine', async () => {
+      const service = new SpeedQueenService('test-key', 'loc_d23f6c', () => {});
+      await expect(
+        service.sendMachineCommand('Brandoa1', 'w99', 'remote_start'),
+      ).rejects.toThrow('No Speed Queen mapping');
+    });
+  });
+});
diff --git a/src/server/index.ts b/src/server/index.ts
index aae14d8..e058c3f 100644
--- a/src/server/index.ts
+++ b/src/server/index.ts
@@ -9,6 +9,9 @@ import { listAgents, updateHeartbeat, saveMeta, getAgent, updateRelayMeta, listS
 import expenditureRoutes from './routes/expenditure';
 import inviteRoutes, { publicRouter as invitePublicRoutes } from './routes/invites';
 import invoicingRoutes from './routes/invoicing';
+import { SpeedQueenService } from './services/speedqueen';
+import { MockSpeedQueenService } from './services/speedqueen-mock';
+import type { LaundryMachine, SpeedQueenCommandType } from '../../types';
 
 
 const asBool = (val: string | undefined, fallback = false) => {
@@ -176,6 +179,13 @@ const PRIMARY_CAMERAS_DEFAULT_ENABLED = asBool(process.env.PRIMARY_CAMERAS_DEFAU
 const PRIMARY_CAMERA_FRONT_RTSP_URL = (process.env.PRIMARY_CAMERA_FRONT_RTSP_URL || '').trim();
 const PRIMARY_CAMERA_BACK_RTSP_URL = (process.env.PRIMARY_CAMERA_BACK_RTSP_URL || '').trim();
 
+// Speed Queen Insights API configuration
+const SPEEDQUEEN_API_KEY = (process.env.SPEEDQUEEN_API_KEY || '').trim();
+const SPEEDQUEEN_LOCATIONS = (process.env.SPEEDQUEEN_LOCATIONS || '').trim();
+const SPEEDQUEEN_POLL_INTERVAL_MS = parseDurationMs(process.env.SPEEDQUEEN_POLL_INTERVAL_MS, 60_000);
+const SPEEDQUEEN_MOCK = asBool(process.env.SPEEDQUEEN_MOCK, false);
+const SPEEDQUEEN_ENABLED = Boolean(SPEEDQUEEN_MOCK || (SPEEDQUEEN_API_KEY && SPEEDQUEEN_LOCATIONS));
+
 const isKnownLaundry = (agentId: string) => KNOWN_LAUNDRY_SET.size === 0 || KNOWN_LAUNDRY_SET.has(agentId) || agentId === 'FixCost' || agentId === GENERAL_AGENT_ID;
 const isPrimaryLaundry = (agentId: string) => Boolean(PRIMARY_LAUNDRY_ID) && agentId === PRIMARY_LAUNDRY_ID;
 
@@ -1799,19 +1809,11 @@ app.put('/api/agents/:id/relays/:relayId/meta', requireAdminOrUser, (req, res) =
 });
 
 // --- MACHINE STATUS API ---
-// In-memory cache for machine status (will be populated by agent heartbeats)
-type MachineStatus = 'idle' | 'running' | 'unknown';
-type MachineType = 'washer' | 'dryer';
-interface LaundryMachine {
-  id: string;
-  label: string;
-  type: MachineType;
-  status: MachineStatus;
-  lastUpdated: number;
-}
-const machineStatusCache = new Map<string, { machines: LaundryMachine[]; lastAnalyzed: number }>();
+// In-memory cache for machine status (will be populated by agent heartbeats or Speed Queen API)
+const machineStatusCache = new Map<string, { machines: LaundryMachine[]; lastAnalyzed: number; source?: string }>();
 
-// Default machine configurations per laundry (can be configured via DB later)
+// Default machine configurations per laundry (used when no status data yet)
+type MachineType = 'washer' | 'dryer';
 const DEFAULT_MACHINE_CONFIGS: Record<string, Array<{ id: string; label: string; type: MachineType }>> = {
   Brandoa1: [
     { id: 'w1', label: 'Washer 1', type: 'washer' },
@@ -1837,18 +1839,84 @@ const DEFAULT_MACHINE_CONFIGS: Record<string, Array<{ id: string; label: string;
   ],
 };
 
-app.get('/api/agents/:id/machines', (req, res) => {
+// --- SPEED QUEEN SERVICE ---
+let speedQueenService: SpeedQueenService | MockSpeedQueenService | null = null;
+
+const initSpeedQueen = () => {
+  if (!SPEEDQUEEN_ENABLED) {
+    console.log('[central] Speed Queen integration disabled (SPEEDQUEEN_API_KEY or SPEEDQUEEN_LOCATIONS not set)');
+    return;
+  }
+
+  const statusCallback = (agentId: string, machines: LaundryMachine[]) => {
+    machineStatusCache.set(agentId, {
+      machines,
+      lastAnalyzed: Date.now(),
+      source: 'speedqueen',
+    });
+    console.log(`[speedqueen→cache] ${agentId}: ${machines.map(m => `${m.id}=${m.status}`).join(', ')}`);
+  };
+
+  if (SPEEDQUEEN_MOCK) {
+    // Use mock locations if none specified
+    const locations = SPEEDQUEEN_LOCATIONS || 'loc_d23f6c,loc_7b105b';
+    console.log('[central] Initializing Speed Queen MOCK service...');
+    speedQueenService = new MockSpeedQueenService(
+      'mock-api-key',
+      locations,
+      statusCallback,
+      SPEEDQUEEN_POLL_INTERVAL_MS,
+    );
+  } else {
+    console.log('[central] Initializing Speed Queen integration (lazy WebSocket)...');
+    speedQueenService = new SpeedQueenService(
+      SPEEDQUEEN_API_KEY,
+      SPEEDQUEEN_LOCATIONS,
+      statusCallback,
+      SPEEDQUEEN_POLL_INTERVAL_MS,
+    );
+  }
+
+  speedQueenService.start().catch(err => {
+    console.error('[central] Failed to start Speed Queen service:', err);
+  });
+};
+
+app.get('/api/agents/:id/machines', async (req, res) => {
   const { id } = req.params;
   if (!isKnownLaundry(id)) {
     return res.status(404).json({ error: 'agent not found' });
   }
 
+  // Notify Speed Queen service of UI activity (triggers lazy WS connect)
+  if (speedQueenService && 'notifyUiActivity' in speedQueenService) {
+    (speedQueenService as SpeedQueenService).notifyUiActivity();
+  }
+
+  // If Speed Queen is active, try on-demand fetch (respects cache TTL)
+  if (speedQueenService && 'getMachinesOnDemand' in speedQueenService) {
+    try {
+      const machines = await (speedQueenService as SpeedQueenService).getMachinesOnDemand(id);
+      if (machines.length > 0) {
+        return res.json({
+          agentId: id,
+          machines,
+          lastAnalyzed: Date.now(),
+          source: 'speedqueen',
+        });
+      }
+    } catch (_err) {
+      // Fall through to cache / defaults
+    }
+  }
+
   const cached = machineStatusCache.get(id);
   if (cached) {
     return res.json({
       agentId: id,
       machines: cached.machines,
       lastAnalyzed: cached.lastAnalyzed,
+      source: cached.source || 'camera',
     });
   }
 
@@ -1857,7 +1925,7 @@ app.get('/api/agents/:id/machines', (req, res) => {
   const now = Date.now();
   const machines: LaundryMachine[] = defaultConfig.map(m => ({
     ...m,
-    status: 'unknown' as MachineStatus,
+    status: 'unknown' as const,
     lastUpdated: now,
   }));
 
@@ -1865,16 +1933,24 @@ app.get('/api/agents/:id/machines', (req, res) => {
     agentId: id,
     machines,
     lastAnalyzed: 0,
+    source: SPEEDQUEEN_ENABLED ? 'speedqueen' : 'camera',
   });
 });
 
 // Endpoint to update machine status (called by agent after frame analysis)
+// When Speed Queen is active for this agent, camera-based updates are ignored
 app.post('/api/agents/:id/machines', requireAdminOrUser, (req, res) => {
   const { id } = req.params;
   if (!isKnownLaundry(id)) {
     return res.status(404).json({ error: 'agent not found' });
   }
 
+  // Skip camera-based updates if Speed Queen is providing status for this agent
+  const existingCache = machineStatusCache.get(id);
+  if (existingCache?.source === 'speedqueen') {
+    return res.json({ ok: true, skipped: true, reason: 'speedqueen active' });
+  }
+
   const { machines } = req.body || {};
   if (!Array.isArray(machines)) {
     return res.status(400).json({ error: 'machines array required' });
@@ -1889,11 +1965,109 @@ app.post('/api/agents/:id/machines', requireAdminOrUser, (req, res) => {
       lastUpdated: m.lastUpdated || Date.now(),
     })),
     lastAnalyzed: Date.now(),
+    source: 'camera',
   });
 
   res.json({ ok: true });
 });
 
+// --- SPEED QUEEN COMMAND API ---
+// Get machine detail with cycles (for machine detail panel)
+app.get('/api/agents/:id/machines/:machineId/detail', async (req, res) => {
+  const { id: agentId, machineId } = req.params;
+  if (!isKnownLaundry(agentId)) {
+    return res.status(404).json({ error: 'agent not found' });
+  }
+  if (!speedQueenService) {
+    return res.status(400).json({ error: 'Speed Queen integration not configured' });
+  }
+
+  // Notify UI activity for lazy WS
+  if ('notifyUiActivity' in speedQueenService) {
+    (speedQueenService as SpeedQueenService).notifyUiActivity();
+  }
+
+  const mapping = speedQueenService.getMachineMapping(agentId, machineId);
+  if (!mapping) {
+    return res.status(404).json({ error: 'machine not found in Speed Queen mapping' });
+  }
+
+  try {
+    const cycles = await speedQueenService.getMachineCycles(agentId, machineId);
+    const cached = machineStatusCache.get(agentId);
+    const machine = cached?.machines?.find(m => m.id === machineId);
+
+    res.json({
+      machine: machine || { id: machineId, label: mapping.label, type: mapping.type, status: 'unknown', lastUpdated: Date.now() },
+      cycles,
+      locationId: mapping.locationId,
+      speedqueenId: mapping.speedqueenId,
+      model: mapping.model,
+    });
+  } catch (err: any) {
+    console.error(`[speedqueen] Failed to get detail for ${agentId}/${machineId}:`, err);
+    res.status(500).json({ error: err.message || 'Failed to fetch machine detail' });
+  }
+});
+
+// Send command to a machine
+app.post('/api/agents/:id/machines/:machineId/command', requireAdminOrUser, async (req, res) => {
+  const { id: agentId, machineId } = req.params;
+  if (!isKnownLaundry(agentId)) {
+    return res.status(404).json({ error: 'agent not found' });
+  }
+  if (!speedQueenService) {
+    return res.status(400).json({ error: 'Speed Queen integration not configured' });
+  }
+
+  const { commandType, params } = req.body || {};
+  if (!commandType) {
+    return res.status(400).json({ error: 'commandType required' });
+  }
+
+  const validCommands: SpeedQueenCommandType[] = [
+    'remote_start', 'remote_stop', 'remote_vend', 'select_cycle',
+    'start_dryer_with_time', 'clear_error', 'set_out_of_order',
+    'rapid_advance', 'clear_partial_vend',
+  ];
+  if (!validCommands.includes(commandType)) {
+    return res.status(400).json({ error: `Invalid commandType. Valid: ${validCommands.join(', ')}` });
+  }
+
+  try {
+    const result = await speedQueenService.sendMachineCommand(agentId, machineId, commandType, params || {});
+    console.log(`[speedqueen] Command ${commandType} sent to ${agentId}/${machineId}: ${JSON.stringify(result).slice(0, 200)}`);
+    res.json({ ok: true, command: result });
+  } catch (err: any) {
+    console.error(`[speedqueen] Command failed for ${agentId}/${machineId}:`, err);
+    res.status(500).json({ error: err.message || 'Command failed' });
+  }
+});
+
+// Get command status
+app.get('/api/agents/:id/machines/:machineId/command/:commandId', async (req, res) => {
+  const { id: agentId, machineId, commandId } = req.params;
+  if (!speedQueenService) {
+    return res.status(400).json({ error: 'Speed Queen integration not configured' });
+  }
+
+  try {
+    const result = await speedQueenService.getCommandStatus(agentId, machineId, commandId);
+    res.json(result);
+  } catch (err: any) {
+    res.status(500).json({ error: err.message || 'Failed to get command status' });
+  }
+});
+
+// Check if Speed Queen is enabled
+app.get('/api/speedqueen/status', (_req, res) => {
+  res.json({
+    enabled: SPEEDQUEEN_ENABLED,
+    active: speedQueenService?.isActive() ?? false,
+    locations: SPEEDQUEEN_LOCATIONS ? SPEEDQUEEN_LOCATIONS.split(',').map(s => s.trim()) : [],
+  });
+});
+
 // --- SCHEDULES API ---
 app.get('/api/agents/:id/schedules', (req, res) => {
   const list = listSchedules(req.params.id);
@@ -2132,6 +2306,12 @@ wss.on('connection', (socket) => {
       }
 
       if (msg.type === 'machine_status') {
+        // Skip camera-based updates if Speed Queen is providing status for this agent
+        const existingEntry = machineStatusCache.get(agentId);
+        if (existingEntry?.source === 'speedqueen') {
+          console.log(`[central] machine_status ${agentId}: skipped (speedqueen active)`);
+          return;
+        }
         const machines = Array.isArray(msg.machines) ? msg.machines : [];
         if (machines.length > 0) {
           machineStatusCache.set(agentId, {
@@ -2144,6 +2324,7 @@ wss.on('connection', (socket) => {
               lastUpdated: m.lastUpdated || Date.now(),
             })),
             lastAnalyzed: Date.now(),
+            source: 'camera',
           });
           console.log(`[central] machine_status ${agentId}: ${machines.map((m: any) => `${m.id}=${m.status}`).join(', ')}`);
         }
@@ -2203,7 +2384,9 @@ if (process.env.NODE_ENV !== 'test') {
   server.listen(PORT, () => {
     console.log(`[central] HTTP+WS listening on ${PORT}`);
     console.log(`[central] WS endpoint ws://localhost:${PORT}/agent`);
+    // Initialize Speed Queen integration after server is ready
+    initSpeedQueen();
   });
 }
 
-export { app, server };
+export { app, server, speedQueenService, SPEEDQUEEN_MOCK, initSpeedQueen };
diff --git a/src/server/services/speedqueen-mock.ts b/src/server/services/speedqueen-mock.ts
new file mode 100644
index 0000000..97a211b
--- /dev/null
+++ b/src/server/services/speedqueen-mock.ts
@@ -0,0 +1,403 @@
+/**
+ * Mock Speed Queen API for local development.
+ *
+ * Enable via: SPEEDQUEEN_MOCK=true
+ *
+ * Simulates:
+ *  - REST endpoints (machines, cycles, commands)
+ *  - WebSocket-like real-time status pushes
+ *  - Realistic status cycling (AVAILABLE → IN_USE → END_OF_CYCLE → AVAILABLE)
+ *  - Command responses (start, stop, etc.)
+ */
+
+import type {
+  MachineType,
+  MachineStatus,
+  LaundryMachine,
+  SpeedQueenMachineCycle,
+  SpeedQueenCommandType,
+} from '../../../types';
+import type {
+  MachineMapping,
+  LocationMapping,
+  StatusUpdateCallback,
+  MachineStatusCallback,
+} from './speedqueen';
+import {
+  buildMachineMappings,
+  parseLocationConfig,
+  buildCommand,
+  LOCATION_TO_AGENT,
+} from './speedqueen';
+
+// ---------------------------------------------------------------------------
+// Mock SQ machine status type
+// ---------------------------------------------------------------------------
+type SQStatusName = 'AVAILABLE' | 'IN_USE' | 'END_OF_CYCLE' | 'OUT_OF_ORDER' | 'ERROR';
+
+interface MockMachineState {
+  mapping: MachineMapping;
+  sqStatus: SQStatusName;
+  remainingSeconds: number;
+  remainingVend: number;
+  isDoorOpen: boolean;
+  selectedCycle: { id: string; name: string } | null;
+  selectedModifier: { id: string; name: string } | null;
+}
+
+function mapSQStatusMock(sqStatus: string): MachineStatus {
+  switch (sqStatus) {
+    case 'AVAILABLE': return 'idle';
+    case 'IN_USE': return 'running';
+    case 'END_OF_CYCLE': return 'idle';
+    case 'OUT_OF_ORDER': return 'out_of_order';
+    case 'ERROR': return 'error';
+    default: return 'unknown';
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Mock cycles per machine model
+// ---------------------------------------------------------------------------
+const MOCK_CYCLES: Record<string, SpeedQueenMachineCycle[]> = {
+  SY80U: [
+    { id: 'cyc_normal_80', name: 'Normal', vendPrice: 350, duration: 1800 },
+    { id: 'cyc_heavy_80', name: 'Heavy Duty', vendPrice: 450, duration: 2400 },
+    { id: 'cyc_delicate_80', name: 'Delicate', vendPrice: 350, duration: 1500 },
+  ],
+  SY105U: [
+    { id: 'cyc_normal_105', name: 'Normal', vendPrice: 450, duration: 1800 },
+    { id: 'cyc_heavy_105', name: 'Heavy Duty', vendPrice: 550, duration: 2400 },
+    { id: 'cyc_delicate_105', name: 'Delicate', vendPrice: 450, duration: 1500 },
+  ],
+  SY135U: [
+    { id: 'cyc_normal_135', name: 'Normal', vendPrice: 550, duration: 2100 },
+    { id: 'cyc_heavy_135', name: 'Heavy Duty', vendPrice: 650, duration: 2700 },
+    { id: 'cyc_quick_135', name: 'Quick Wash', vendPrice: 450, duration: 1200 },
+  ],
+  SY180U: [
+    { id: 'cyc_normal_180', name: 'Normal', vendPrice: 700, duration: 2400 },
+    { id: 'cyc_heavy_180', name: 'Heavy Duty', vendPrice: 850, duration: 3000 },
+    { id: 'cyc_bedding_180', name: 'Bedding', vendPrice: 750, duration: 2700 },
+  ],
+  'Tumbler 30 lbs Stack': [
+    { id: 'cyc_regular_dry', name: 'Regular Dry', vendPrice: 200, duration: 2400 },
+    { id: 'cyc_high_dry', name: 'High Heat', vendPrice: 250, duration: 3000 },
+    { id: 'cyc_low_dry', name: 'Low Heat', vendPrice: 200, duration: 3600 },
+  ],
+};
+
+// ---------------------------------------------------------------------------
+// MockSpeedQueenService
+// ---------------------------------------------------------------------------
+export class MockSpeedQueenService {
+  private locationIds: string[];
+  private machineMappings: MachineMapping[];
+  private machineStates = new Map<string, MockMachineState>();
+  private machinesByAgent = new Map<string, LaundryMachine[]>();
+  private cyclesByMachine = new Map<string, SpeedQueenMachineCycle[]>();
+  private onStatusUpdate: StatusUpdateCallback;
+  private simulationTimer: ReturnType<typeof setInterval> | null = null;
+  private started = false;
+
+  constructor(
+    _apiKey: string,
+    locationConfig: string,
+    onStatusUpdate: StatusUpdateCallback,
+    _pollIntervalMs = 60_000,
+  ) {
+    this.onStatusUpdate = onStatusUpdate;
+
+    const mappings = parseLocationConfig(locationConfig);
+    this.locationIds = mappings.map(m => m.locationId);
+    this.machineMappings = buildMachineMappings(mappings);
+
+    // Initialize mock state for each machine
+    for (const mapping of this.machineMappings) {
+      const state: MockMachineState = {
+        mapping,
+        sqStatus: 'AVAILABLE',
+        remainingSeconds: 0,
+        remainingVend: 0,
+        isDoorOpen: false,
+        selectedCycle: null,
+        selectedModifier: null,
+      };
+      this.machineStates.set(`${mapping.agentId}:${mapping.localId}`, state);
+    }
+
+    // Randomly set some machines to IN_USE on init
+    this.randomizeInitialStates();
+  }
+
+  private randomizeInitialStates(): void {
+    const states = Array.from(this.machineStates.values());
+    for (const state of states) {
+      const roll = Math.random();
+      if (roll < 0.3) {
+        // 30% chance: IN_USE with some remaining time
+        state.sqStatus = 'IN_USE';
+        state.remainingSeconds = Math.floor(Math.random() * 1800) + 300;
+        const cycles = MOCK_CYCLES[state.mapping.model] || [];
+        if (cycles.length > 0) {
+          const c = cycles[Math.floor(Math.random() * cycles.length)];
+          state.selectedCycle = { id: c.id, name: c.name };
+          state.remainingVend = c.vendPrice ?? 0;
+        }
+      } else if (roll < 0.35) {
+        // 5% chance: END_OF_CYCLE
+        state.sqStatus = 'END_OF_CYCLE';
+        state.isDoorOpen = false;
+      } else if (roll < 0.38) {
+        // 3% chance: ERROR
+        state.sqStatus = 'ERROR';
+      }
+      // else: AVAILABLE (62%)
+    }
+  }
+
+  async start(): Promise<void> {
+    if (this.started) return;
+    this.started = true;
+
+    console.log(`[speedqueen-mock] Starting mock service for locations: ${this.locationIds.join(', ')}`);
+    console.log(`[speedqueen-mock] ${this.machineMappings.length} machines simulated`);
+
+    // Push initial state
+    this.pushAllStatuses();
+
+    // Simulate status changes every 10 seconds
+    this.simulationTimer = setInterval(() => {
+      this.simulateStatusChanges();
+    }, 10_000);
+  }
+
+  stop(): void {
+    this.started = false;
+    if (this.simulationTimer) {
+      clearInterval(this.simulationTimer);
+      this.simulationTimer = null;
+    }
+    console.log('[speedqueen-mock] Service stopped');
+  }
+
+  private simulateStatusChanges(): void {
+    const changedAgents = new Set<string>();
+
+    for (const state of this.machineStates.values()) {
+      const prev = state.sqStatus;
+      switch (state.sqStatus) {
+        case 'IN_USE':
+          // Decrement remaining time
+          state.remainingSeconds = Math.max(0, state.remainingSeconds - 10);
+          if (state.remainingSeconds <= 0) {
+            state.sqStatus = 'END_OF_CYCLE';
+            state.remainingSeconds = 0;
+            state.isDoorOpen = false;
+            changedAgents.add(state.mapping.agentId);
+          }
+          break;
+
+        case 'END_OF_CYCLE':
+          // 20% chance of becoming available (someone picks up laundry)
+          if (Math.random() < 0.2) {
+            state.sqStatus = 'AVAILABLE';
+            state.isDoorOpen = true;
+            state.selectedCycle = null;
+            state.selectedModifier = null;
+            state.remainingVend = 0;
+            changedAgents.add(state.mapping.agentId);
+          }
+          break;
+
+        case 'AVAILABLE':
+          // 5% chance of going IN_USE (someone starts a wash)
+          if (Math.random() < 0.05) {
+            state.sqStatus = 'IN_USE';
+            state.isDoorOpen = false;
+            const cycles = MOCK_CYCLES[state.mapping.model] || [];
+            if (cycles.length > 0) {
+              const c = cycles[Math.floor(Math.random() * cycles.length)];
+              state.selectedCycle = { id: c.id, name: c.name };
+              state.remainingVend = c.vendPrice ?? 0;
+              state.remainingSeconds = c.duration ?? 1800;
+            } else {
+              state.remainingSeconds = 1800;
+            }
+            changedAgents.add(state.mapping.agentId);
+          }
+          break;
+
+        case 'ERROR':
+          // 10% chance of clearing error
+          if (Math.random() < 0.1) {
+            state.sqStatus = 'AVAILABLE';
+            state.isDoorOpen = false;
+            state.selectedCycle = null;
+            state.remainingSeconds = 0;
+            changedAgents.add(state.mapping.agentId);
+          }
+          break;
+      }
+
+      // Always track IN_USE decrement as a change (for real-time countdown)
+      if (prev === 'IN_USE' && state.sqStatus === 'IN_USE') {
+        changedAgents.add(state.mapping.agentId);
+      }
+    }
+
+    // Push updates for changed agents
+    for (const agentId of changedAgents) {
+      this.pushAgentStatus(agentId);
+    }
+  }
+
+  private pushAllStatuses(): void {
+    const agentIds = new Set(this.machineMappings.map(m => m.agentId));
+    for (const agentId of agentIds) {
+      this.pushAgentStatus(agentId);
+    }
+  }
+
+  private pushAgentStatus(agentId: string): void {
+    const machines: LaundryMachine[] = [];
+    for (const state of this.machineStates.values()) {
+      if (state.mapping.agentId !== agentId) continue;
+      machines.push(this.stateToLaundryMachine(state));
+    }
+    this.machinesByAgent.set(agentId, machines);
+    this.onStatusUpdate(agentId, machines);
+  }
+
+  private stateToLaundryMachine(state: MockMachineState): LaundryMachine {
+    return {
+      id: state.mapping.localId,
+      label: state.mapping.label,
+      type: state.mapping.type,
+      status: mapSQStatusMock(state.sqStatus),
+      lastUpdated: Date.now(),
+      source: 'speedqueen',
+      speedqueenId: state.mapping.speedqueenId,
+      remainingSeconds: state.remainingSeconds,
+      remainingVend: state.remainingVend,
+      isDoorOpen: state.isDoorOpen,
+      selectedCycle: state.selectedCycle,
+      selectedModifier: state.selectedModifier,
+      model: state.mapping.model,
+    };
+  }
+
+  // Public API — same interface as SpeedQueenService
+  getMachines(agentId: string): LaundryMachine[] {
+    return this.machinesByAgent.get(agentId) || [];
+  }
+
+  getMachineMapping(agentId: string, localMachineId: string): MachineMapping | undefined {
+    return this.machineMappings.find(m => m.agentId === agentId && m.localId === localMachineId);
+  }
+
+  getLocationIdForAgent(agentId: string): string | undefined {
+    return Object.entries(LOCATION_TO_AGENT).find(([, aid]) => aid === agentId)?.[0];
+  }
+
+  getMachineMappingsForAgent(agentId: string): MachineMapping[] {
+    return this.machineMappings.filter(m => m.agentId === agentId);
+  }
+
+  async sendMachineCommand(
+    agentId: string,
+    localMachineId: string,
+    commandType: SpeedQueenCommandType,
+    params?: Record<string, unknown>,
+  ): Promise<{ id: string; status: string }> {
+    const key = `${agentId}:${localMachineId}`;
+    const state = this.machineStates.get(key);
+    if (!state) {
+      throw new Error(`No Speed Queen mapping for ${agentId}/${localMachineId}`);
+    }
+
+    const commandId = `mock_cmd_${Date.now()}`;
+    console.log(`[speedqueen-mock] Command ${commandType} for ${key} (params: ${JSON.stringify(params)})`);
+
+    // Simulate command effects
+    switch (commandType) {
+      case 'remote_start': {
+        state.sqStatus = 'IN_USE';
+        state.isDoorOpen = false;
+        const cycleId = params?.cycleId as string | undefined;
+        const cycles = MOCK_CYCLES[state.mapping.model] || [];
+        const cycle = cycleId ? cycles.find(c => c.id === cycleId) : cycles[0];
+        if (cycle) {
+          state.selectedCycle = { id: cycle.id, name: cycle.name };
+          state.remainingVend = cycle.vendPrice ?? 0;
+          state.remainingSeconds = cycle.duration ?? 1800;
+        } else {
+          state.remainingSeconds = 1800;
+        }
+        break;
+      }
+      case 'remote_stop':
+        state.sqStatus = 'END_OF_CYCLE';
+        state.remainingSeconds = 0;
+        break;
+      case 'clear_error':
+        state.sqStatus = 'AVAILABLE';
+        state.remainingSeconds = 0;
+        state.selectedCycle = null;
+        break;
+      case 'set_out_of_order':
+        state.sqStatus = 'OUT_OF_ORDER';
+        state.remainingSeconds = 0;
+        break;
+      case 'select_cycle': {
+        const selId = params?.cycleId as string | undefined;
+        const allCycles = MOCK_CYCLES[state.mapping.model] || [];
+        const sel = selId ? allCycles.find(c => c.id === selId) : null;
+        if (sel) {
+          state.selectedCycle = { id: sel.id, name: sel.name };
+          state.remainingVend = sel.vendPrice ?? 0;
+        }
+        break;
+      }
+      // Other commands: just acknowledge
+    }
+
+    // Push updated status immediately
+    this.pushAgentStatus(agentId);
+
+    return { id: commandId, status: 'completed' };
+  }
+
+  async getCommandStatus(
+    _agentId: string,
+    _localMachineId: string,
+    commandId: string,
+  ): Promise<{ id: string; status: string }> {
+    return { id: commandId, status: 'completed' };
+  }
+
+  async getMachineCycles(agentId: string, localMachineId: string): Promise<SpeedQueenMachineCycle[]> {
+    const mapping = this.getMachineMapping(agentId, localMachineId);
+    if (!mapping) return [];
+
+    const cacheKey = `${mapping.locationId}:${mapping.speedqueenId}`;
+    const cached = this.cyclesByMachine.get(cacheKey);
+    if (cached) return cached;
+
+    const cycles = MOCK_CYCLES[mapping.model] || [];
+    this.cyclesByMachine.set(cacheKey, cycles);
+    return cycles;
+  }
+
+  getRestClient(): null {
+    return null; // Mock doesn't expose real REST client
+  }
+
+  isActive(): boolean {
+    return this.started;
+  }
+
+  async pollAllLocations(): Promise<void> {
+    this.pushAllStatuses();
+  }
+}
diff --git a/src/server/services/speedqueen.ts b/src/server/services/speedqueen.ts
new file mode 100644
index 0000000..f02d131
--- /dev/null
+++ b/src/server/services/speedqueen.ts
@@ -0,0 +1,941 @@
+/**
+ * Speed Queen Insights API Client
+ *
+ * REST client for locations, machines, cycles, commands (x-api-key auth)
+ * WebSocket real-time client using Centrifuge protocol (vanilla WebSocket)
+ */
+import { WebSocket } from 'ws';
+import type {
+  MachineType,
+  MachineStatus,
+  LaundryMachine,
+  SpeedQueenMachineCycle,
+  SpeedQueenCommandType,
+} from '../../../types';
+
+// ---------------------------------------------------------------------------
+// Config
+// ---------------------------------------------------------------------------
+const API_BASE = 'https://api.alliancelaundrydigital.com';
+const WS_URL = 'wss://realtime.alliancelaundrydigital.com/connection/websocket';
+const RATE_LIMIT_MS = 110; // ~10 req/s max
+
+// ---------------------------------------------------------------------------
+// Location → agentId mapping (Speed Queen loc_id → our internal agentId)
+// ---------------------------------------------------------------------------
+export interface LocationMapping {
+  locationId: string;
+  agentId: string;
+}
+
+// Machine mapping: Speed Queen machine ID → our internal identifiers
+export interface MachineMapping {
+  speedqueenId: string;       // mac_xxx
+  localId: string;            // w1, d5, etc.
+  label: string;              // "Washer 1", "Dryer 5"
+  type: MachineType;
+  model: string;
+  locationId: string;
+  agentId: string;
+}
+
+// ---------------------------------------------------------------------------
+// Speed Queen API response types
+// ---------------------------------------------------------------------------
+interface SQLocation {
+  id: string;
+  name: string;
+  [key: string]: unknown;
+}
+
+interface SQMachineStatus {
+  id: string;
+  status: string;
+  remainingSeconds?: number;
+  remainingVend?: number;
+  isDoorOpen?: boolean;
+  timestamp?: number;
+  location?: { id: string };
+  machine?: { id: string };
+  selectedCycle?: { id: string; name: string } | null;
+  selectedModifier?: { id: string; name: string } | null;
+}
+
+interface SQMachine {
+  id: string;
+  name?: string;
+  machineType?: string;
+  model?: string;
+  nodeNumber?: number;
+  status?: SQMachineStatus;
+  [key: string]: unknown;
+}
+
+interface SQCycle {
+  id: string;
+  name: string;
+  vendPrice?: number;
+  duration?: number;
+  [key: string]: unknown;
+}
+
+interface SQError {
+  id: string;
+  name: string;
+  type: string;
+  code: number;
+  machine: { id: string };
+  location: { id: string };
+  timestamp: string;
+}
+
+interface SQCommandResponse {
+  id: string;
+  status?: string;
+  [key: string]: unknown;
+}
+
+// ---------------------------------------------------------------------------
+// Hardcoded machine mappings from API reference
+// ---------------------------------------------------------------------------
+const BRANDOA1_MACHINES: Omit<MachineMapping, 'agentId'>[] = [
+  { speedqueenId: 'mac_1096b5', localId: 'w1', label: 'Washer 1', type: 'washer', model: 'SY80U', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_4a38fe', localId: 'w2', label: 'Washer 2', type: 'washer', model: 'SY105U', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_f6789c', localId: 'w3', label: 'Washer 3', type: 'washer', model: 'SY135U', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_cc70a4', localId: 'w4', label: 'Washer 4', type: 'washer', model: 'SY180U', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_85ee99', localId: 'd5', label: 'Dryer 5', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_7b916e', localId: 'd6', label: 'Dryer 6', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_8390f6', localId: 'd7', label: 'Dryer 7', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
+  { speedqueenId: 'mac_491704', localId: 'd8', label: 'Dryer 8', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_d23f6c' },
+];
+
+const BRANDOA2_MACHINES: Omit<MachineMapping, 'agentId'>[] = [
+  { speedqueenId: 'mac_7ac4e0', localId: 'd1', label: 'Dryer 1', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_6b81fe', localId: 'd2', label: 'Dryer 2', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_210c84', localId: 'd3', label: 'Dryer 3', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_ba39d8', localId: 'd4', label: 'Dryer 4', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_8a4fec', localId: 'd5', label: 'Dryer 5', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_24f325', localId: 'd6', label: 'Dryer 6', type: 'dryer', model: 'Tumbler 30 lbs Stack', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_e1f20d', localId: 'w7', label: 'Washer 7', type: 'washer', model: 'SY80U', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_d3e083', localId: 'w8', label: 'Washer 8', type: 'washer', model: 'SY105U', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_917060', localId: 'w9', label: 'Washer 9', type: 'washer', model: 'SY135U', locationId: 'loc_7b105b' },
+  { speedqueenId: 'mac_8f4a36', localId: 'w10', label: 'Washer 10', type: 'washer', model: 'SY180U', locationId: 'loc_7b105b' },
+];
+
+// Map location IDs to agent IDs
+const LOCATION_TO_AGENT: Record<string, string> = {
+  loc_d23f6c: 'Brandoa1',
+  loc_7b105b: 'Brandoa2',
+};
+
+// ---------------------------------------------------------------------------
+// Status mapping: Speed Queen → our internal
+// ---------------------------------------------------------------------------
+function mapSQStatus(sqStatus: string): MachineStatus {
+  const s = (sqStatus || '').toUpperCase();
+  switch (s) {
+    case 'AVAILABLE': return 'idle';
+    case 'IN_USE': return 'running';
+    case 'END_OF_CYCLE': return 'idle';
+    case 'DIAGNOSTIC': return 'out_of_order';
+    case 'OUT_OF_ORDER': return 'out_of_order';
+    case 'ERROR': return 'error';
+    default: return 'unknown';
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Rate limiter
+// ---------------------------------------------------------------------------
+let lastRequestTime = 0;
+async function rateLimit(): Promise<void> {
+  const now = Date.now();
+  const diff = now - lastRequestTime;
+  if (diff < RATE_LIMIT_MS) {
+    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - diff));
+  }
+  lastRequestTime = Date.now();
+}
+
+// ---------------------------------------------------------------------------
+// REST Client
+// ---------------------------------------------------------------------------
+export class SpeedQueenRestClient {
+  private apiKey: string;
+
+  constructor(apiKey: string) {
+    this.apiKey = apiKey;
+  }
+
+  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
+    await rateLimit();
+
+    const url = `${API_BASE}${path}`;
+    const headers: Record<string, string> = {
+      'x-api-key': this.apiKey,
+      'Content-Type': 'application/json',
+    };
+
+    const options: RequestInit = { method, headers };
+    if (body !== undefined) {
+      options.body = JSON.stringify(body);
+    }
+
+    const res = await fetch(url, options);
+    if (!res.ok) {
+      const text = await res.text().catch(() => '');
+      throw new Error(`Speed Queen API ${method} ${path} failed: ${res.status} ${text}`);
+    }
+
+    const contentType = res.headers.get('content-type') || '';
+    if (contentType.includes('application/json')) {
+      return res.json() as Promise<T>;
+    }
+    return {} as T;
+  }
+
+  // Locations
+  async getLocations(): Promise<SQLocation[]> {
+    return this.request<SQLocation[]>('GET', '/v1/locations');
+  }
+
+  async getLocation(locationId: string): Promise<SQLocation> {
+    return this.request<SQLocation>('GET', `/v1/locations/${locationId}`);
+  }
+
+  // Machines
+  async getMachines(locationId: string): Promise<SQMachine[]> {
+    return this.request<SQMachine[]>('GET', `/v1/locations/${locationId}/machines`);
+  }
+
+  async getMachine(locationId: string, machineId: string): Promise<SQMachine> {
+    return this.request<SQMachine>('GET', `/v1/locations/${locationId}/machines/${machineId}`);
+  }
+
+  // Cycles
+  async getMachineCycles(locationId: string, machineId: string): Promise<SQCycle[]> {
+    return this.request<SQCycle[]>('GET', `/v1/locations/${locationId}/machines/${machineId}/cycles`);
+  }
+
+  // Commands
+  async sendCommand(locationId: string, machineId: string, command: Record<string, unknown>): Promise<SQCommandResponse> {
+    return this.request<SQCommandResponse>('POST', `/v1/locations/${locationId}/machines/${machineId}/commands`, command);
+  }
+
+  async getCommandStatus(locationId: string, machineId: string, commandId: string): Promise<SQCommandResponse> {
+    return this.request<SQCommandResponse>('GET', `/v1/locations/${locationId}/machines/${machineId}/commands/${commandId}`);
+  }
+
+  // Errors
+  async getMachineErrors(locationId: string, machineId: string): Promise<SQError[]> {
+    return this.request<SQError[]>('GET', `/v1/locations/${locationId}/machines/${machineId}/errors`);
+  }
+
+  // Realtime auth
+  async getRealtimeToken(): Promise<string> {
+    await rateLimit();
+
+    const res = await fetch(`${API_BASE}/v1/realtime/auth`, {
+      method: 'POST',
+      headers: {
+        'Authorization': this.apiKey,
+        'Content-Type': 'application/json',
+      },
+    });
+
+    if (!res.ok) {
+      throw new Error(`Speed Queen realtime auth failed: ${res.status}`);
+    }
+
+    const data = await res.json() as { token?: string };
+    if (!data.token) {
+      throw new Error('Speed Queen realtime auth: no token in response');
+    }
+    return data.token;
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Command builders
+// ---------------------------------------------------------------------------
+export function buildCommand(commandType: SpeedQueenCommandType, params?: Record<string, unknown>): Record<string, unknown> {
+  switch (commandType) {
+    case 'remote_start':
+      return { type: 'MachineRemoteStartCommandRequest', ...params };
+    case 'remote_stop':
+      return { type: 'MachineRemoteStopCommandRequest', ...params };
+    case 'remote_vend':
+      return { type: 'MachineRemoteVendCommandRequest', ...params };
+    case 'select_cycle':
+      return { type: 'MachineSelectMachineCycleCommandRequest', ...params };
+    case 'start_dryer_with_time':
+      return { type: 'MachineStartDryerWithTimeCommandRequest', ...params };
+    case 'clear_error':
+      return { type: 'MachineClearErrorCommandRequest', ...params };
+    case 'set_out_of_order':
+      return { type: 'MachineProgramOutOfOrderCommandRequest', ...params };
+    case 'rapid_advance':
+      return { type: 'MachineRapidAdvanceToNextStepCommandRequest', ...params };
+    case 'clear_partial_vend':
+      return { type: 'MachineClearPartialVendCommandRequest', ...params };
+    default:
+      throw new Error(`Unknown command type: ${commandType}`);
+  }
+}
+
+// ---------------------------------------------------------------------------
+// WebSocket Client (Centrifuge protocol over vanilla WebSocket)
+// ---------------------------------------------------------------------------
+export type MachineStatusCallback = (agentId: string, machines: LaundryMachine[]) => void;
+export type MachineErrorCallback = (agentId: string, error: SQError) => void;
+export type MachineEventCallback = (agentId: string, event: Record<string, unknown>) => void;
+
+interface WSMessage {
+  id?: number;
+  connect?: { token: string; name?: string };
+  subscribe?: { channel: string };
+  result?: unknown;
+  push?: {
+    channel?: string;
+    pub?: { data?: unknown };
+  };
+  error?: { code: number; message: string };
+}
+
+export class SpeedQueenWSClient {
+  private restClient: SpeedQueenRestClient;
+  private locationIds: string[];
+  private machineMappings: MachineMapping[];
+  private ws: WebSocket | null = null;
+  private token: string = '';
+  private messageId = 0;
+  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
+  private reconnectDelay = 1000;
+  private maxReconnectDelay = 30000;
+  private destroyed = false;
+  private subscribedChannels = new Set<string>();
+
+  // Callbacks
+  onMachineStatus: MachineStatusCallback | null = null;
+  onMachineError: MachineErrorCallback | null = null;
+  onMachineEvent: MachineEventCallback | null = null;
+
+  // Lookup maps
+  private sqIdToMapping: Map<string, MachineMapping>;
+  private locationToAgent: Map<string, string>;
+
+  constructor(restClient: SpeedQueenRestClient, locationIds: string[], machineMappings: MachineMapping[]) {
+    this.restClient = restClient;
+    this.locationIds = locationIds;
+    this.machineMappings = machineMappings;
+
+    this.sqIdToMapping = new Map();
+    for (const m of machineMappings) {
+      this.sqIdToMapping.set(m.speedqueenId, m);
+    }
+
+    this.locationToAgent = new Map();
+    for (const [locId, agentId] of Object.entries(LOCATION_TO_AGENT)) {
+      this.locationToAgent.set(locId, agentId);
+    }
+  }
+
+  async connect(): Promise<void> {
+    if (this.destroyed) return;
+
+    try {
+      this.token = await this.restClient.getRealtimeToken();
+      console.log('[speedqueen-ws] Got realtime token');
+    } catch (err) {
+      console.error('[speedqueen-ws] Failed to get realtime token:', err);
+      this.scheduleReconnect();
+      return;
+    }
+
+    try {
+      this.ws = new WebSocket(WS_URL);
+    } catch (err) {
+      console.error('[speedqueen-ws] Failed to create WebSocket:', err);
+      this.scheduleReconnect();
+      return;
+    }
+
+    this.ws.on('open', () => {
+      console.log('[speedqueen-ws] Connected, sending auth...');
+      this.reconnectDelay = 1000;
+      this.subscribedChannels.clear();
+      this.sendMessage({
+        connect: { token: this.token, name: 'laundropi-control' },
+      });
+    });
+
+    this.ws.on('message', (data) => {
+      try {
+        const msg = JSON.parse(data.toString()) as WSMessage;
+        this.handleMessage(msg);
+      } catch (err) {
+        console.error('[speedqueen-ws] Failed to parse message:', err);
+      }
+    });
+
+    this.ws.on('close', (code, reason) => {
+      console.log(`[speedqueen-ws] Disconnected: ${code} ${reason?.toString() || ''}`);
+      this.ws = null;
+      if (!this.destroyed) {
+        this.scheduleReconnect();
+      }
+    });
+
+    this.ws.on('error', (err) => {
+      console.error('[speedqueen-ws] Error:', err.message);
+    });
+  }
+
+  private sendMessage(msg: Partial<WSMessage>): void {
+    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
+    this.messageId++;
+    const payload = { id: this.messageId, ...msg };
+    this.ws.send(JSON.stringify(payload));
+  }
+
+  private handleMessage(msg: WSMessage): void {
+    // Connection response → subscribe to channels
+    if (msg.result !== undefined && !msg.push) {
+      console.log('[speedqueen-ws] Connected successfully');
+      this.subscribeToChannels();
+      return;
+    }
+
+    // Error response
+    if (msg.error) {
+      console.error(`[speedqueen-ws] Error: ${msg.error.code} ${msg.error.message}`);
+      if (msg.error.code === 109) {
+        // Token expired, reconnect with new token
+        console.log('[speedqueen-ws] Token expired, refreshing...');
+        this.close();
+        this.connect();
+      }
+      return;
+    }
+
+    // Push message (real-time data)
+    if (msg.push?.pub?.data) {
+      const channel = msg.push.channel || '';
+      const data = msg.push.pub.data as Record<string, unknown>;
+      this.handlePush(channel, data);
+    }
+  }
+
+  private subscribeToChannels(): void {
+    for (const locId of this.locationIds) {
+      const channels = [
+        `machine.status:location:${locId}`,
+        `machine.error:location:${locId}`,
+        `machine.event:location:${locId}`,
+      ];
+      for (const channel of channels) {
+        if (!this.subscribedChannels.has(channel)) {
+          this.sendMessage({ subscribe: { channel } });
+          this.subscribedChannels.add(channel);
+        }
+      }
+    }
+    console.log(`[speedqueen-ws] Subscribed to ${this.subscribedChannels.size} channels`);
+  }
+
+  private handlePush(channel: string, data: Record<string, unknown>): void {
+    if (channel.startsWith('machine.status:')) {
+      this.handleStatusPush(data);
+    } else if (channel.startsWith('machine.error:')) {
+      this.handleErrorPush(data);
+    } else if (channel.startsWith('machine.event:')) {
+      this.handleEventPush(channel, data);
+    }
+  }
+
+  private handleStatusPush(data: Record<string, unknown>): void {
+    // data might be a single machine status or contain nested machine status
+    const machineId = (data.machine as { id?: string })?.id ||
+                      (data.id as string) || '';
+    const mapping = this.sqIdToMapping.get(machineId);
+    if (!mapping) {
+      console.log(`[speedqueen-ws] Unknown machine in status push: ${machineId}`);
+      return;
+    }
+
+    const machine = this.mapSQStatusToLaundryMachine(data as unknown as SQMachineStatus, mapping);
+    if (this.onMachineStatus) {
+      this.onMachineStatus(mapping.agentId, [machine]);
+    }
+  }
+
+  private handleErrorPush(data: Record<string, unknown>): void {
+    const error = data as unknown as SQError;
+    const machineId = error.machine?.id || '';
+    const mapping = this.sqIdToMapping.get(machineId);
+    const agentId = mapping?.agentId ||
+                    this.locationToAgent.get(error.location?.id || '') || '';
+    if (agentId && this.onMachineError) {
+      this.onMachineError(agentId, error);
+    }
+  }
+
+  private handleEventPush(channel: string, data: Record<string, unknown>): void {
+    // Extract location from channel
+    const locMatch = channel.match(/:location:(.+)$/);
+    const locId = locMatch?.[1] || '';
+    const agentId = this.locationToAgent.get(locId) || '';
+    if (agentId && this.onMachineEvent) {
+      this.onMachineEvent(agentId, data);
+    }
+  }
+
+  mapSQStatusToLaundryMachine(sq: SQMachineStatus, mapping: MachineMapping): LaundryMachine {
+    return {
+      id: mapping.localId,
+      label: mapping.label,
+      type: mapping.type,
+      status: mapSQStatus(sq.status),
+      lastUpdated: Date.now(),
+      source: 'speedqueen',
+      speedqueenId: mapping.speedqueenId,
+      remainingSeconds: sq.remainingSeconds ?? 0,
+      remainingVend: sq.remainingVend ?? 0,
+      isDoorOpen: sq.isDoorOpen ?? false,
+      selectedCycle: sq.selectedCycle || null,
+      selectedModifier: sq.selectedModifier || null,
+      model: mapping.model,
+    };
+  }
+
+  private scheduleReconnect(): void {
+    if (this.destroyed || this.reconnectTimer) return;
+    console.log(`[speedqueen-ws] Reconnecting in ${this.reconnectDelay}ms...`);
+    this.reconnectTimer = setTimeout(() => {
+      this.reconnectTimer = null;
+      this.connect();
+    }, this.reconnectDelay);
+    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
+  }
+
+  close(): void {
+    if (this.ws) {
+      try { this.ws.close(); } catch (_) { /* ignore */ }
+      this.ws = null;
+    }
+    if (this.reconnectTimer) {
+      clearTimeout(this.reconnectTimer);
+      this.reconnectTimer = null;
+    }
+  }
+
+  destroy(): void {
+    this.destroyed = true;
+    this.close();
+  }
+
+  isConnected(): boolean {
+    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
+  }
+}
+
+// ---------------------------------------------------------------------------
+// SpeedQueenService — orchestrates REST + WS, manages state
+//
+// Lazy connection: WebSocket connects ONLY when UI clients are actively
+// viewing machines.  After 60 s with no UI interest the WS disconnects.
+// REST calls happen on-demand only (no automatic polling interval).
+// Cache TTL: 30 s — stale data triggers a fresh REST fetch on next request.
+// ---------------------------------------------------------------------------
+export type StatusUpdateCallback = (agentId: string, machines: LaundryMachine[]) => void;
+
+const STATUS_CACHE_TTL_MS = 30_000;   // 30 s
+const WS_IDLE_TIMEOUT_MS  = 60_000;   // disconnect WS after 60 s idle
+
+export class SpeedQueenService {
+  private restClient: SpeedQueenRestClient;
+  private wsClient: SpeedQueenWSClient | null = null;
+  private locationIds: string[];
+  private machineMappings: MachineMapping[];
+  private pollingTimer: ReturnType<typeof setInterval> | null = null;
+  private pollIntervalMs: number;
+  private onStatusUpdate: StatusUpdateCallback;
+  private started = false;
+
+  // Caches
+  private machinesByAgent = new Map<string, LaundryMachine[]>();
+  private cyclesByMachine = new Map<string, SpeedQueenMachineCycle[]>();
+
+  // Cache timestamps for TTL
+  private lastPollByAgent = new Map<string, number>();
+
+  // Lazy WebSocket bookkeeping
+  private lastUiActivity = 0;
+  private wsIdleTimer: ReturnType<typeof setInterval> | null = null;
+  private wsConnecting = false;
+
+  constructor(
+    apiKey: string,
+    locationConfig: string, // comma-separated "loc_id:agentId" pairs or just loc_ids
mcp startup: no servers
2026-02-16T23:25:57.270485Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c670a-bee4-75a0-b6bc-83f647cb685d
2026-02-16T23:25:57.303062Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c61b8-5adf-74e1-aa01-d1aeb899a891
2026-02-16T23:25:57.334950Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c6169-26f7-7d50-8877-65e92acdbcd6
2026-02-16T23:25:57.355955Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c6717-cad9-7e23-b046-283d049278aa
2026-02-16T23:25:57.390842Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c5e90-4259-7503-ab35-7078737af441
2026-02-16T23:25:57.449526Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c6730-786c-75e3-a93e-dcd35e699fea

thinking
**Starting detailed code review**
codex
Reviewing the diff with a code-review lens first, then I’ll call out concrete findings by severity with file/line references across bugs, security, performance, quality, and test gaps. I’m starting by loading the changed files from the workspace so the findings are grounded in exact code.

thinking
**Listing changed files**
exec
/bin/zsh -lc 'git diff --name-only' in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-il10bsLy' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eEdFp93H' (errno=Operation not permitted)

thinking
**Working around git write issues**
codex
I hit a sandbox limitation running `git diff` directly, so I’m reviewing from the changed files themselves with line numbers instead. Next I’m scanning `index.ts`, `speedqueen.ts`, and the new UI panel for high-impact bugs and auth/security issues.

thinking
**Planning parallel multi-file inspection**
exec
/bin/zsh -lc "nl -ba src/server/index.ts | sed -n '1820,2015p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/index.ts | sed -n '2015,2395p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/index.ts | sed -n '170,280p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
  2015	  const { id: agentId, machineId } = req.params;
  2016	  if (!isKnownLaundry(agentId)) {
  2017	    return res.status(404).json({ error: 'agent not found' });
  2018	  }
  2019	  if (!speedQueenService) {
  2020	    return res.status(400).json({ error: 'Speed Queen integration not configured' });
  2021	  }
  2022	
  2023	  const { commandType, params } = req.body || {};
  2024	  if (!commandType) {
  2025	    return res.status(400).json({ error: 'commandType required' });
  2026	  }
  2027	
  2028	  const validCommands: SpeedQueenCommandType[] = [
  2029	    'remote_start', 'remote_stop', 'remote_vend', 'select_cycle',
  2030	    'start_dryer_with_time', 'clear_error', 'set_out_of_order',
  2031	    'rapid_advance', 'clear_partial_vend',
  2032	  ];
  2033	  if (!validCommands.includes(commandType)) {
  2034	    return res.status(400).json({ error: `Invalid commandType. Valid: ${validCommands.join(', ')}` });
 succeeded in 52ms:
   170	const KNOWN_LAUNDRY_IDS = (() => {
   171	  const explicit = parseCsv(process.env.LAUNDRY_IDS);
   172	  if (explicit.length) return explicit;
   173	  if (AGENT_SECRET_MAP.size) return Array.from(AGENT_SECRET_MAP.keys());
   174	  return [];
   175	})();
   176	const KNOWN_LAUNDRY_SET = new Set(KNOWN_LAUNDRY_IDS);
   177	const PRIMARY_LAUNDRY_ID = (process.env.PRIMARY_LAUNDRY_ID || KNOWN_LAUNDRY_IDS[0] || '').trim();
   178	const PRIMARY_CAMERAS_DEFAULT_ENABLED = asBool(process.env.PRIMARY_CAMERAS_DEFAULT_ENABLED, false);
   179	const PRIMARY_CAMERA_FRONT_RTSP_URL = (process.env.PRIMARY_CAMERA_FRONT_RTSP_URL || '').trim();
   180	const PRIMARY_CAMERA_BACK_RTSP_URL = (process.env.PRIMARY_CAMERA_BACK_RTSP_URL || '').trim();
   181	
   182	// Speed Queen Insights API configuration
   183	const SPEEDQUEEN_API_KEY = (process.env.SPEEDQUEEN_API_KEY || '').trim();
   184	const SPEEDQUEEN_LOCATIONS = (process.env.SPEEDQUEEN_LOCATIONS || '').trim();
   185	const SPEEDQUEEN_POLL_INTERVAL_MS = parseDurationMs(process.env.SPEEDQUEEN_POLL_INTERVAL_MS, 60_000);
   186	const SPEEDQUEEN_MOCK = asBool(process.env.SPEEDQUEEN_MOCK, false);
   187	const SPEEDQUEEN_ENABLED = Boolean(SPEEDQUEEN_MOCK || (SPEEDQUEEN_API_KEY && SPEEDQUEEN_LOCATIONS));
   188	
   189	const isKnownLaundry = (agentId: string) => KNOWN_LAUNDRY_SET.size === 0 || KNOWN_LAUNDRY_SET.has(agentId) || agentId === 'FixCost' || agentId === GENERAL_AGENT_ID;
 succeeded in 52ms:
  1820	    { id: 'w2', label: 'Washer 2', type: 'washer' },
  1821	    { id: 'w3', label: 'Washer 3', type: 'washer' },
  1822	    { id: 'w4', label: 'Washer 4', type: 'washer' },
  1823	    { id: 'd5', label: 'Dryer 5', type: 'dryer' },
  1824	    { id: 'd6', label: 'Dryer 6', type: 'dryer' },
  1825	    { id: 'd7', label: 'Dryer 7', type: 'dryer' },
  1826	    { id: 'd8', label: 'Dryer 8', type: 'dryer' },
  1827	  ],
  1828	  Brandoa2: [
  1829	    { id: 'w1', label: 'Washer 1', type: 'washer' },
  1830	    { id: 'w2', label: 'Washer 2', type: 'washer' },
  1831	    { id: 'w3', label: 'Washer 3', type: 'washer' },
  1832	    { id: 'w4', label: 'Washer 4', type: 'washer' },
  1833	    { id: 'd1', label: 'Dryer 1', type: 'dryer' },
  1834	    { id: 'd2', label: 'Dryer 2', type: 'dryer' },
  1835	    { id: 'd3', label: 'Dryer 3', type: 'dryer' },
  1836	    { id: 'd4', label: 'Dryer 4', type: 'dryer' },
  1837	    { id: 'd5', label: 'Dryer 5', type: 'dryer' },
  1838	    { id: 'd6', label: 'Dryer 6', type: 'dryer' },
  1839	  ],

thinking
**Inspecting module structure and exports**
codex
I’ve confirmed the server route changes and now I’m checking `speedqueen.ts` end-to-end for runtime and type-level issues, because most integration risk appears there (state updates, WS behavior, command handling).
exec
/bin/zsh -lc "nl -ba src/server/services/speedqueen.ts | sed -n '520,780p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/services/speedqueen.ts | sed -n '260,520p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/services/speedqueen.ts | sed -n '780,1030p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/services/speedqueen.ts | sed -n '1,260p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
   520	
   521	  close(): void {
   522	    if (this.ws) {
   523	      try { this.ws.close(); } catch (_) { /* ignore */ }
   524	      this.ws = null;
   525	    }
   526	    if (this.reconnectTimer) {
   527	      clearTimeout(this.reconnectTimer);
   528	      this.reconnectTimer = null;
   529	    }
   530	  }
   531	
   532	  destroy(): void {
   533	    this.destroyed = true;
   534	    this.close();
   535	  }
   536	
   537	  isConnected(): boolean {
   538	    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
   539	  }
 succeeded in 51ms:
   260	// ---------------------------------------------------------------------------
   261	export function buildCommand(commandType: SpeedQueenCommandType, params?: Record<string, unknown>): Record<string, unknown> {
   262	  switch (commandType) {
   263	    case 'remote_start':
   264	      return { type: 'MachineRemoteStartCommandRequest', ...params };
   265	    case 'remote_stop':
   266	      return { type: 'MachineRemoteStopCommandRequest', ...params };
   267	    case 'remote_vend':
   268	      return { type: 'MachineRemoteVendCommandRequest', ...params };
   269	    case 'select_cycle':
   270	      return { type: 'MachineSelectMachineCycleCommandRequest', ...params };
   271	    case 'start_dryer_with_time':
   272	      return { type: 'MachineStartDryerWithTimeCommandRequest', ...params };
   273	    case 'clear_error':
   274	      return { type: 'MachineClearErrorCommandRequest', ...params };
   275	    case 'set_out_of_order':
   276	      return { type: 'MachineProgramOutOfOrderCommandRequest', ...params };
   277	    case 'rapid_advance':
   278	      return { type: 'MachineRapidAdvanceToNextStepCommandRequest', ...params };
   279	    case 'clear_partial_vend':
 succeeded in 50ms:
   780	      console.log(`[speedqueen] Polled ${locationId} (${agentId}): ${machines.map(m => `${m.id}=${m.status}`).join(', ')}`);
   781	    }
   782	  }
   783	
   784	  private mergeStatus(agentId: string, updatedMachines: LaundryMachine[]): void {
   785	    const current = this.machinesByAgent.get(agentId) || [];
   786	    for (const updated of updatedMachines) {
   787	      const idx = current.findIndex(m => m.id === updated.id);
   788	      if (idx >= 0) {
   789	        current[idx] = updated;
   790	      } else {
   791	        current.push(updated);
   792	      }
   793	    }
   794	    this.machinesByAgent.set(agentId, current);
   795	    this.lastPollByAgent.set(agentId, Date.now());
   796	    this.onStatusUpdate(agentId, current);
   797	  }
   798	
   799	  // Get cached machines for an agent (no REST call — use getMachinesOnDemand for fresh data)
 succeeded in 51ms:
     1	/**
     2	 * Speed Queen Insights API Client
     3	 *
     4	 * REST client for locations, machines, cycles, commands (x-api-key auth)
     5	 * WebSocket real-time client using Centrifuge protocol (vanilla WebSocket)
     6	 */
     7	import { WebSocket } from 'ws';
     8	import type {
     9	  MachineType,
    10	  MachineStatus,
    11	  LaundryMachine,
    12	  SpeedQueenMachineCycle,
    13	  SpeedQueenCommandType,
    14	} from '../../../types';
    15	
    16	// ---------------------------------------------------------------------------
    17	// Config
    18	// ---------------------------------------------------------------------------
    19	const API_BASE = 'https://api.alliancelaundrydigital.com';
    20	const WS_URL = 'wss://realtime.alliancelaundrydigital.com/connection/websocket';

thinking
**Planning UI inspection for issues**
exec
/bin/zsh -lc "nl -ba services/api.ts | sed -n '460,620p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba services/api.ts | sed -n '1,120p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba components/views/DashboardView.tsx | sed -n '1,520p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba components/MachineDetailPanel.tsx | sed -n '1,340p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
     1	
     2	import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, RevenueDeduction, UiUser, CameraConfig, ExpenditureImport, ExpenditureTransaction, ExpenditureAudit, LaundryMachineStatus, SpeedQueenMachineDetail, SpeedQueenMachineCycle, SpeedQueenCommandType } from '../types';
     3	
     4	type LocationLike = { hostname: string; port: string; protocol: string };
     5	
     6	export const resolveBaseUrl = (options?: { envBase?: string; location?: LocationLike | null }) => {
     7	  const envBase = (typeof options?.envBase === 'string' ? options.envBase : (import.meta as any).env?.VITE_CENTRAL_URL) || '';
     8	  if (envBase.trim()) {
     9	    return envBase.trim().replace(/\/$/, '');
    10	  }
    11	  // When no VITE_CENTRAL_URL is set, use relative URLs (go through Vite proxy in dev)
    12	  return '';
    13	};
    14	
    15	const BASE_URL = resolveBaseUrl();
    16	
    17	const API_BASE = BASE_URL ? `${BASE_URL}/api` : '/api';
    18	const AUTH_BASE = BASE_URL ? `${BASE_URL}/auth` : '/auth';
    19	
    20	const AGENT_ID = (import.meta as any).env?.VITE_AGENT_ID || 'dev-agent';
 succeeded in 51ms:
     1	import React, { useState, useEffect, useCallback } from 'react';
     2	import { X, Play, Square, AlertTriangle, Ban, Clock, DoorOpen, DoorClosed, Loader2, CheckCircle, XCircle, WashingMachine, Wind } from 'lucide-react';
     3	import { LaundryMachine, SpeedQueenMachineCycle, SpeedQueenCommandType } from '../types';
     4	import { ApiService } from '../services/api';
     5	
     6	interface MachineDetailPanelProps {
     7	  agentId: string;
     8	  machine: LaundryMachine;
     9	  onClose: () => void;
    10	  isSpeedQueen: boolean;
    11	  isViewer: boolean;
    12	}
    13	
    14	type CommandFeedback = {
    15	  status: 'pending' | 'success' | 'failed';
    16	  message: string;
    17	};
    18	
    19	const formatTime = (seconds: number): string => {
    20	  if (seconds <= 0) return '0:00';
 succeeded in 52ms:
     1	import React, { useState } from 'react';
     2	import { LayoutDashboard, Server, Cpu, Pencil, Camera as CameraIcon, CameraOff as CameraOffIcon, ChevronDown, ChevronRight, WashingMachine, Wind, Clock } from 'lucide-react';
     3	import RelayCard from '../RelayCard';
     4	import { MachineDetailPanel } from '../MachineDetailPanel';
     5	import { Relay, CameraConfig, LaundryMachine, LaundryMachineStatus, UiUser } from '../../types';
     6	
     7	interface Laundry {
     8	  id: string;
     9	  name: string;
    10	  relays: Relay[];
    11	  isOnline: boolean;
    12	  isMock: boolean;
    13	  lastHeartbeat: number | null;
    14	}
    15	
    16	interface DashboardViewProps {
    17	  authUser: UiUser | null;
    18	  laundries: Laundry[];
    19	  isRelayEditMode: boolean;
    20	  setIsRelayEditMode: React.Dispatch<React.SetStateAction<boolean>>;
 succeeded in 52ms:
   460	    });
   461	    return await res.json();
   462	  },
   463	
   464	  async deleteExpenditureImport(importId: string): Promise<void> {
   465	    await request(`${API_BASE}/expenditure/imports/${encodeURIComponent(importId)}`, {
   466	      method: 'DELETE',
   467	    });
   468	  },
   469	
   470	  async updateExpenditureTransaction(transactionId: string, updates: {
   471	    reconciliationStatus?: 'new' | 'existing' | 'discrepancy' | 'ignored';
   472	    assignedAgentId?: string | null;
   473	    matchedDeductionKey?: string | null;
   474	    reconciliationNotes?: string | null;
   475	  }): Promise<{ transaction: ExpenditureTransaction }> {
   476	    const res = await request(`${API_BASE}/expenditure/transactions/${encodeURIComponent(transactionId)}`, {
   477	      method: 'PUT',
   478	      headers: { 'Content-Type': 'application/json' },
   479	      body: JSON.stringify(updates),

thinking
**Inspecting new type definitions**
exec
/bin/zsh -lc "nl -ba types.ts | sed -n '1,320p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
     1	export enum RelayType {
     2	  LIGHT = 'LIGHT',
     3	  DOOR = 'DOOR',
     4	  SIGN = 'SIGN',
     5	  MACHINE = 'MACHINE',
     6	  OTHER = 'OTHER'
     7	}
     8	
     9	export interface Relay {
    10	  id: number;
    11	  name: string;
    12	  gpioPin: number;
    13	  type: RelayType;
    14	  isOn: boolean;
    15	  isLocked?: boolean; // If true, cannot be manually toggled
    16	  channelNumber?: number; // Physical channel label on the relay board
    17	  isHidden?: boolean; // Hidden from dashboard when not editing
    18	  iconType?: RelayType; // Which icon to render
    19	  colorGroup?: 'blue' | 'green' | 'orange' | 'pink' | null;
    20	}

thinking
**Continuing type details**
exec
/bin/zsh -lc "nl -ba types.ts | sed -n '320,430p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
   320	  model: string;
   321	  status: MachineStatus;
   322	  remainingSeconds: number;
   323	  remainingVend: number;
   324	  isDoorOpen: boolean;
   325	  selectedCycle: SpeedQueenCycle | null;
   326	  selectedModifier: SpeedQueenModifier | null;
   327	  cycles: SpeedQueenMachineCycle[];
   328	  errorCode?: number;
   329	  errorName?: string;
   330	  errorType?: string;
   331	}

thinking
**Assessing test coverage and constraints**
exec
/bin/zsh -lc "nl -ba src/server/services/speedqueen-mock.ts | sed -n '1,260p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/services/speedqueen-mock.ts | sed -n '260,460p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
   260	  }
   261	
   262	  private pushAgentStatus(agentId: string): void {
   263	    const machines: LaundryMachine[] = [];
   264	    for (const state of this.machineStates.values()) {
   265	      if (state.mapping.agentId !== agentId) continue;
   266	      machines.push(this.stateToLaundryMachine(state));
   267	    }
   268	    this.machinesByAgent.set(agentId, machines);
   269	    this.onStatusUpdate(agentId, machines);
   270	  }
   271	
   272	  private stateToLaundryMachine(state: MockMachineState): LaundryMachine {
   273	    return {
   274	      id: state.mapping.localId,
   275	      label: state.mapping.label,
   276	      type: state.mapping.type,
   277	      status: mapSQStatusMock(state.sqStatus),
   278	      lastUpdated: Date.now(),
   279	      source: 'speedqueen',
 succeeded in 51ms:
     1	/**
     2	 * Mock Speed Queen API for local development.
     3	 *
     4	 * Enable via: SPEEDQUEEN_MOCK=true
     5	 *
     6	 * Simulates:
     7	 *  - REST endpoints (machines, cycles, commands)
     8	 *  - WebSocket-like real-time status pushes
     9	 *  - Realistic status cycling (AVAILABLE → IN_USE → END_OF_CYCLE → AVAILABLE)
    10	 *  - Command responses (start, stop, etc.)
    11	 */
    12	
    13	import type {
    14	  MachineType,
    15	  MachineStatus,
    16	  LaundryMachine,
    17	  SpeedQueenMachineCycle,
    18	  SpeedQueenCommandType,
    19	} from '../../../types';
    20	import type {

thinking
**Inspecting auth middleware for security**
exec
/bin/zsh -lc "nl -ba src/server/index.ts | sed -n '1,170p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "rg -n \"requireAdminOrUser|requireReadAccess|app.use\\('/api'|auth\" src/server/index.ts" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
     1	import * as http from 'http';
     2	import * as path from 'path';
     3	import express = require('express');
     4	import cors = require('cors');
     5	import { WebSocketServer, WebSocket } from 'ws';
     6	import * as crypto from 'crypto';
     7	import { v4 as uuidv4 } from 'uuid';
     8	import { listAgents, updateHeartbeat, saveMeta, getAgent, updateRelayMeta, listSchedules, upsertSchedule, deleteSchedule, listGroups, listGroupsForMembership, upsertGroup, deleteGroup, GroupRow, deleteAgent, upsertAgent, upsertCommand, listPendingCommands, deleteCommand, updateCommandsForRelay, expireOldCommands, insertLead, getLastLeadTimestampForIp, listLeads, getRevenueEntry, listRevenueEntriesBetween, listRevenueEntries, listRevenueEntryDatesBetween, listRevenueEntryDatesWithInfo, getStripeDates, upsertRevenueEntry, insertRevenueAudit, listRevenueAudit, RevenueEntryRow, listUiUsers, getUiUser, createUiUser, updateUiUserRole, updateUiUserPassword, updateUiUserLastLogin, deleteUiUser, countUiUsers, listCameras, getCamera, upsertCamera, deleteCamera, upsertIntegrationSecret, getIntegrationSecret, deleteIntegrationSecret, CameraRow, listInventory, getInventory, updateInventory, getInventoryAudit, getLastInventoryChange, DetergentType } from './db';
     9	import expenditureRoutes from './routes/expenditure';
    10	import inviteRoutes, { publicRouter as invitePublicRoutes } from './routes/invites';
    11	import invoicingRoutes from './routes/invoicing';
    12	import { SpeedQueenService } from './services/speedqueen';
    13	import { MockSpeedQueenService } from './services/speedqueen-mock';
    14	import type { LaundryMachine, SpeedQueenCommandType } from '../../types';
    15	
    16	
    17	const asBool = (val: string | undefined, fallback = false) => {
    18	  if (val === undefined) return fallback;
    19	  return ['1', 'true', 'yes', 'on'].includes(val.toLowerCase());
    20	};
 succeeded in 51ms:
984:    // When auth is disabled, set anonymous session for endpoints that need username tracking
988:  if (!session) return res.status(401).json({ error: 'unauthorized' });
1001:const requireAdminOrUser: express.RequestHandler = (_req, res, next) => {
1008:// Allows GET requests for all authenticated users (including viewers), but blocks non-GET for non-admins
1011:  // GET requests allowed for all authenticated users (including viewers)
1019:app.get('/auth/session', (req, res) => {
1027:app.post('/auth/login', (req, res) => {
1052:app.post('/auth/logout', (_req, res) => {
1188:// Public invite endpoints (must be registered BEFORE global /api auth middleware)
1189:// These allow unauthenticated access for the setup page
1192:// Apply authentication middleware to all /api routes
1193:app.use('/api', requireUiAuth);
1211:// Serve leads viewer HTML page (requires auth via API calls)
1341:    return res.status(401).json({ error: 'authentication required to modify revenue' });
1457:app.post('/api/inventory/:agentId/:detergentType', requireAdminOrUser, (req, res) => {
1460:    return res.status(401).json({ error: 'Unauthorized' });
1554:// Camera updates: all authenticated users can toggle enabled, admin/user can change other settings
1712:app.delete('/api/agents/:id', requireAdminOrUser, (req, res) => {
1726:app.post('/api/agents/:id/relays/:relayId/toggle', requireAdminOrUser, (req, res) => {
1737:app.post('/api/agents/:id/relays/:relayId/state', requireAdminOrUser, (req, res) => {

thinking
**Assessing middleware auth for GET endpoints**
exec
/bin/zsh -lc "nl -ba src/server/index.ts | sed -n '940,1035p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
   940	const verifySession = (token: string | undefined): SessionPayload | null => {
   941	  if (!token) return null;
   942	  const [body, sig] = token.split('.');
   943	  if (!body || !sig) return null;
   944	  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
   945	  if (!safeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
   946	  try {
   947	    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
   948	    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
   949	    return payload;
   950	  } catch {
   951	    return null;
   952	  }
   953	};
   954	
   955	const getSession = (req: express.Request) => {
   956	  const cookies = parseCookies(req.headers.cookie);
   957	  return verifySession(cookies[SESSION_COOKIE_NAME]);
   958	};
   959	

thinking
**Identifying multiple logic and performance bugs**
codex
I’ve identified several concrete logic issues already; I’m doing one more pass for test coverage gaps and whether the new code can regress under concurrent API calls. Then I’ll return a prioritized findings list with precise file references.

thinking
**Assessing test coverage scope**
exec
/bin/zsh -lc "nl -ba src/server/__tests__/speedqueen.test.ts | sed -n '1,220p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/__tests__/speedqueen-lazy.test.ts | sed -n '1,260p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/__tests__/speedqueen.test.ts | sed -n '220,460p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba src/server/__tests__/speedqueen-api.test.ts | sed -n '1,220p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
     1	import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
     2	
     3	// Mock fetch globally before importing the module
     4	const mockFetch = vi.fn();
     5	global.fetch = mockFetch as any;
     6	
     7	// Mock WebSocket
     8	vi.mock('ws', () => {
     9	  const EventEmitter = require('events');
    10	  class MockWebSocket extends EventEmitter {
    11	    static OPEN = 1;
    12	    static CLOSED = 3;
    13	    readyState = 1;
    14	    send = vi.fn();
    15	    close = vi.fn();
    16	    constructor() {
    17	      super();
    18	      setTimeout(() => this.emit('open'), 0);
    19	    }
    20	  }
 succeeded in 52ms:
     1	import { describe, it, expect, vi, beforeEach } from 'vitest';
     2	
     3	// Mock fetch globally before importing the module
     4	const mockFetch = vi.fn();
     5	global.fetch = mockFetch as any;
     6	
     7	// Mock WebSocket
     8	vi.mock('ws', () => {
     9	  const EventEmitter = require('events');
    10	  class MockWebSocket extends EventEmitter {
    11	    static OPEN = 1;
    12	    static CLOSED = 3;
    13	    readyState = 1; // OPEN
    14	    send = vi.fn();
    15	    close = vi.fn();
    16	    constructor() {
    17	      super();
    18	      // Simulate open after construction
    19	      setTimeout(() => this.emit('open'), 0);
    20	    }
 succeeded in 52ms:
   220	      const result = await client.getLocations();
   221	      expect(result).toHaveLength(1);
   222	      expect(mockFetch).toHaveBeenCalledWith(
   223	        'https://api.alliancelaundrydigital.com/v1/locations',
   224	        expect.objectContaining({
   225	          method: 'GET',
   226	          headers: expect.objectContaining({
   227	            'x-api-key': 'test-api-key',
   228	          }),
   229	        }),
   230	      );
   231	    });
   232	
   233	    it('calls getMachines for a location', async () => {
   234	      mockFetch.mockResolvedValueOnce({
   235	        ok: true,
   236	        headers: new Headers({ 'content-type': 'application/json' }),
   237	        json: () => Promise.resolve([{ id: 'mac_1', status: 'AVAILABLE' }]),
   238	      });
   239	
 succeeded in 50ms:
     1	import request from 'supertest';
     2	import { describe, it, expect, vi, beforeEach } from 'vitest';
     3	
     4	const setupApp = async (overrides: Record<string, string | undefined> = {}) => {
     5	  vi.resetModules();
     6	  process.env.NODE_ENV = 'test';
     7	  process.env.CENTRAL_DB_PATH = ':memory:';
     8	  process.env.CENTRAL_ENV_FILE = '/dev/null';
     9	  process.env.ALLOW_INSECURE = 'true';
    10	  process.env.CORS_ORIGINS = 'http://localhost';
    11	  process.env.REQUIRE_CORS_ORIGINS = 'false';
    12	  process.env.ALLOW_DYNAMIC_AGENT_REGISTRATION = 'true';
    13	  process.env.AGENT_SECRETS = '';
    14	  process.env.LAUNDRY_IDS = '';
    15	  // Do NOT set SPEEDQUEEN_API_KEY — SQ disabled by default
    16	  delete process.env.SPEEDQUEEN_API_KEY;
    17	  delete process.env.SPEEDQUEEN_LOCATIONS;
    18	  Object.entries(overrides).forEach(([key, value]) => {
    19	    if (value === undefined) {
    20	      delete process.env[key];

thinking
**Identifying multiple potential bugs and performance issues**
exec
/bin/zsh -lc 'cat tsconfig.json' in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "types": [
      "node"
    ],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",

thinking
**Assessing security and logic issues**
exec
/bin/zsh -lc "nl -ba App.tsx | sed -n '2280,2460p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba App.tsx | sed -n '1460,1700p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc 'rg -n "machineStatus|/machines" components src | head -n 80' in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:

 succeeded in 52ms:
  1460	        authPassword={authPassword}
  1461	        authError={authError}
  1462	        brandLogoUrl={BRAND_LOGO_URL}
  1463	        setAuthLogin={setAuthLogin}
  1464	        setAuthPassword={setAuthPassword}
  1465	        handleLoginSubmit={handleLoginSubmit}
  1466	      />
  1467	    );
  1468	  }
  1469	
  1470	  if (isLoading && laundries.length === 0) {
  1471	    console.log('[LaundroPi] render branch: loading screen', { isLoading, relaysLen: relays.length, activeTab });
  1472	    return <LoadingScreen message="Loading LaundroPi..." />;
  1473	  }
  1474	
  1475	  console.log('[LaundroPi] render branch: main UI', { isLoading, relaysLen: relays.length, activeTab, schedulesLen: schedules.length });
  1476	  return (
  1477	    <div className="min-h-screen pb-24 overflow-x-hidden">
  1478	      <Header
  1479	        brandLogoUrl={BRAND_LOGO_URL}
 succeeded in 51ms:
components/views/DashboardView.tsx:51:  machineStatus: Record<string, LaundryMachineStatus>;
components/views/DashboardView.tsx:61:const machineStatusStyle = (status: string) => {
components/views/DashboardView.tsx:76:const machineStatusBadgeStyle = (status: string) => {
components/views/DashboardView.tsx:98:    className={`flex items-center justify-between px-2 py-1.5 rounded-md border text-xs text-left w-full transition-colors hover:brightness-110 ${machineStatusStyle(machine.status)}`}
components/views/DashboardView.tsx:109:      <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${machineStatusBadgeStyle(machine.status)}`}>
components/views/DashboardView.tsx:348:              const status = props.machineStatus[laundry.id];
components/views/DashboardView.tsx:439:        isSpeedQueen={props.machineStatus[selectedMachine.agentId]?.source === 'speedqueen'}
src/server/index.ts:1813:const machineStatusCache = new Map<string, { machines: LaundryMachine[]; lastAnalyzed: number; source?: string }>();
src/server/index.ts:1852:    machineStatusCache.set(agentId, {
src/server/index.ts:1885:app.get('/api/agents/:id/machines', async (req, res) => {
src/server/index.ts:1913:  const cached = machineStatusCache.get(id);
src/server/index.ts:1942:app.post('/api/agents/:id/machines', requireAdminOrUser, (req, res) => {
src/server/index.ts:1949:  const existingCache = machineStatusCache.get(id);
src/server/index.ts:1959:  machineStatusCache.set(id, {
src/server/index.ts:1976:app.get('/api/agents/:id/machines/:machineId/detail', async (req, res) => {
src/server/index.ts:1997:    const cached = machineStatusCache.get(agentId);
src/server/index.ts:2014:app.post('/api/agents/:id/machines/:machineId/command', requireAdminOrUser, async (req, res) => {
src/server/index.ts:2048:app.get('/api/agents/:id/machines/:machineId/command/:commandId', async (req, res) => {
src/server/index.ts:2310:        const existingEntry = machineStatusCache.get(agentId);
src/server/index.ts:2317:          machineStatusCache.set(agentId, {

thinking
**Searching for fetch method usage**
exec
/bin/zsh -lc "nl -ba App.tsx | sed -n '1040,1320p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "nl -ba App.tsx | sed -n '780,1040p'" in /Users/andery-mini/.openclaw/workspace/laundropi-controlexec
/bin/zsh -lc "rg -n \"fetchMachine|machine status|machines\\)\" App.tsx | head -n 80" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
660:  const fetchMachineStatus = async () => {
668:          console.error(`Failed to fetch machine status for ${laundry.id}`, err);
722:  // Fetch machine status when Dashboard tab is active
725:    fetchMachineStatus();
726:    const timer = setInterval(fetchMachineStatus, 10_000);
 succeeded in 52ms:
   780	    cameraVisibility,
   781	    isAuthenticated,
   782	    isPageVisible,
   783	    laundries,
   784	    isLaundryOnline,
   785	    primaryAgentId,
   786	  ]);
   787	
   788	  useEffect(() => {
   789	    if (typeof document === 'undefined') return;
   790	    const handleVisibility = () => {
   791	      setIsPageVisible(document.visibilityState === 'visible');
   792	    };
   793	    document.addEventListener('visibilitychange', handleVisibility);
   794	    return () => document.removeEventListener('visibilitychange', handleVisibility);
   795	  }, []);
   796	
   797	  useEffect(() => {
   798	    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
   799	    const observer = new IntersectionObserver((entries) => {
 succeeded in 52ms:
  1040	    }
  1041	    await ApiService.batchControl(agent, targetIds, action);
  1042	  };
  1043	
  1044	  const handleRenameRelay = async (id: number, agent: string = primaryAgentId) => {
  1045	    if (!serverOnline) return;
  1046	    const name = (relayNameDrafts[relayDraftKey(agent, id)] || '').trim();
  1047	    if (!name) return;
  1048	    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, name } : r));
  1049	    if (agent === primaryAgentId) {
  1050	      setRelays(prev => prev.map(r => r.id === id ? { ...r, name } : r));
  1051	    }
  1052	    await ApiService.renameRelay(agent, id, name);
  1053	    // keep latest ref in sync so exiting edit doesn't revert names
  1054	    latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, name } : r);
  1055	  };
  1056	
  1057	  const handleRelayNameInput = (agentId: string, id: number, name: string) => {
  1058	    const key = relayDraftKey(agentId, id);
  1059	    setRelayNameDrafts(prev => ({ ...prev, [key]: name }));

thinking
**Adding linesaround fetch function**
exec
/bin/zsh -lc "nl -ba App.tsx | sed -n '620,760p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
   620	    try {
   621	      const result = await ApiService.listRevenueEntryDates(range.startDate, range.endDate);
   622	      setRevenueEntryDates(result.dates);
   623	      setRevenueEntryDateInfo(result.dateInfo);
   624	    } catch (err) {
   625	      if (handleAuthFailure(err)) return;
   626	      console.error('Revenue calendar fetch failed', err);
   627	      setRevenueEntryDates([]);
   628	      setRevenueEntryDateInfo([]);
   629	    }
   630	  };
   631	
   632	  const fetchAllRevenueEntries = async (options?: { silent?: boolean }) => {
   633	    const silent = options?.silent ?? false;
   634	    if (!silent) {
   635	      setRevenueAllLoading(true);
   636	      setRevenueAllError(null);
   637	    }
   638	    try {
   639	      const entries = await ApiService.listRevenueEntries();

thinking
**Inspecting dashboard test coverage**
exec
/bin/zsh -lc "nl -ba components/__tests__/DashboardView.test.tsx | sed -n '1,260p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
     1	import { describe, it, expect, vi } from 'vitest';
     2	import { render, screen } from '@testing-library/react';
     3	import { DashboardView } from '../views/DashboardView';
     4	import { Relay, CameraConfig } from '../../types';
     5	
     6	describe('DashboardView', () => {
     7	  const mockLaundry = {
     8	    id: 'test-agent',
     9	    name: 'Test Laundry',
    10	    relays: [
    11	      {
    12	        id: 1,
    13	        name: 'Test Relay',
    14	        gpioPin: 5,
    15	        type: 'LIGHT' as const,
    16	        iconType: 'LIGHT' as const,
    17	        isOn: false,
    18	        isHidden: false,
    19	        channelNumber: 1,
    20	        colorGroup: 'blue' as const,

thinking
**Identifying missing machine panel tests**
exec
/bin/zsh -lc "rg -n \"getMachineStatus\\(|source\" services/api.ts" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
248:  async getMachineStatus(agentId: string): Promise<LaundryMachineStatus> {
exec
/bin/zsh -lc "nl -ba services/api.ts | sed -n '228,280p'" in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 51ms:
   228	      headers: { 'Content-Type': 'application/json' },
   229	      body: JSON.stringify({ agentId, secret: secret || AGENT_SECRET })
   230	    });
   231	  },
   232	
   233	  async deleteAgent(agentId: string): Promise<void> {
   234	    await request(`${API_BASE}/agents/${agentId}`, { method: 'DELETE' });
   235	  },
   236	
   237	  async getStatus(agentId?: string): Promise<{ relays: Relay[], schedules: Schedule[], groups: RelayGroup[], isMock: boolean, agentId?: string, lastHeartbeat?: number | null }> {
   238	    const id = agentId || AGENT_ID;
   239	    const res = await request(`${API_BASE}/dashboard?agentId=${encodeURIComponent(id)}`, { timeout: 2000 });
   240	    return await res.json();
   241	  },
   242	
   243	  async listCameras(agentId: string): Promise<{ cameras: CameraConfig[] }> {
   244	    const res = await request(`${API_BASE}/agents/${encodeURIComponent(agentId)}/cameras`);
   245	    return await res.json();
   246	  },
   247	

thinking
**Identifying multiple potential bugs and missing security tests**
exec
/bin/zsh -lc 'rg -n "SPEEDQUEEN_POLL_INTERVAL_MS|pollIntervalMs|pollingTimer" src/server/index.ts src/server/services/speedqueen.ts src/server/services/speedqueen-mock.ts' in /Users/andery-mini/.openclaw/workspace/laundropi-control succeeded in 52ms:
src/server/services/speedqueen-mock.ts:107:    _pollIntervalMs = 60_000,
src/server/services/speedqueen.ts:560:  private pollingTimer: ReturnType<typeof setInterval> | null = null;
src/server/services/speedqueen.ts:561:  private pollIntervalMs: number;
src/server/services/speedqueen.ts:581:    pollIntervalMs = 60_000,
src/server/services/speedqueen.ts:585:    this.pollIntervalMs = pollIntervalMs;
src/server/services/speedqueen.ts:613:    if (this.pollingTimer) {
src/server/services/speedqueen.ts:614:      clearInterval(this.pollingTimer);
src/server/services/speedqueen.ts:615:      this.pollingTimer = null;
src/server/index.ts:185:const SPEEDQUEEN_POLL_INTERVAL_MS = parseDurationMs(process.env.SPEEDQUEEN_POLL_INTERVAL_MS, 60_000);
src/server/index.ts:1868:      SPEEDQUEEN_POLL_INTERVAL_MS,
src/server/index.ts:1876:      SPEEDQUEEN_POLL_INTERVAL_MS,

thinking
**Summarizing detailed security and bug findings**
codex
**Findings (ordered by severity)**  
1. **High – custom `locationId:agentId` mappings are partially broken at runtime.** `parseLocationConfig` supports explicit agent IDs, but polling/lookup still hardcode `LOCATION_TO_AGENT`, so on-demand fetches can return empty for custom agent IDs. See `src/server/services/speedqueen.ts:744` and `src/server/services/speedqueen.ts:809`.  
2. **High – WebSocket connection race can create multiple WS clients/leaks under repeated UI activity.** `ensureWsConnected()` only checks `isConnected()`, but `connect()` returns before socket is open; repeated calls can replace `this.wsClient` while previous sockets are still connecting. See `src/server/services/speedqueen.ts:635`, `src/server/services/speedqueen.ts:640`, `src/server/services/speedqueen.ts:676`, `src/server/services/speedqueen.ts:343`.  
3. **Medium – wrong cycle can be sent after switching machines.** `selectedCycleId` is not reset on machine change and initialization is gated by stale `!selectedCycleId`, so a cycle from machine A can be sent to machine B. See `components/MachineDetailPanel.tsx:34`, `components/MachineDetailPanel.tsx:46`, `components/MachineDetailPanel.tsx:54`, `components/MachineDetailPanel.tsx:204`.  
4. **Medium – machine detail panel uses stale machine snapshot, not live status updates.** Dashboard stores full machine object in state, so panel does not track subsequent `machineStatus` polling updates. See `components/views/DashboardView.tsx:123`, `components/views/DashboardView.tsx:397`, `components/views/DashboardView.tsx:437`, and polling at `App.tsx:722`.  
5. **Medium – “Remove Out of Order” action is mislabeled / logic mismatch.** UI label toggles, but click always sends `set_out_of_order`; there is no opposite command. See `components/MachineDetailPanel.tsx:240` and `components/MachineDetailPanel.tsx:245`.  
6. **Medium (security) – upstream error details are sent back to clients.** REST client includes raw upstream response text in thrown errors, then routes return `err.message` directly. This can leak vendor/internal details. See `src/server/services/speedqueen.ts:186`, `src/server/index.ts:2009`, `src/server/index.ts:2043`, `src/server/index.ts:2058`.  
7. **Low (performance) – no in-flight dedupe for on-demand polls.** Concurrent requests can trigger repeated `pollLocation()` calls and unnecessary vendor API load/rate-limit pressure. See `src/server/services/speedqueen.ts:710` and `src/server/services/speedqueen.ts:723`.  
8. **Low (quality) – `SPEEDQUEEN_POLL_INTERVAL_MS` is effectively dead config.** It is parsed and passed through, but not used in real service polling fallback logic despite env docs implying it is. See `src/server/index.ts:185`, `src/server/services/speedqueen.ts:560`, `src/server/services/speedqueen.ts:585`, `src/server/services/speedqueen.ts:733`.

**Missing tests**  
1. No test that `loc_xxx:CustomAgent` works end-to-end for `getMachinesOnDemand` / polling (only parser is tested). See parser-only coverage at `src/server/__tests__/speedqueen.test.ts:93`.  
2. No test for repeated `notifyUiActivity()` during connection setup to catch duplicate WS client creation. Current lazy tests only check first activity path. See `src/server/__tests__/speedqueen-lazy.test.ts:78`.  
3. No frontend tests for machine detail panel behavior (cycle reset per machine, out-of-order toggle semantics, stale selected machine). Existing dashboard tests don’t cover new machine panel flows. See `components/__tests__/DashboardView.test.tsx:66`.  
4. New API tests run with `ALLOW_INSECURE=true`, so auth/role protections for new command/detail/status endpoints are not covered. See `src/server/__tests__/speedqueen-api.test.ts:9`.

I reviewed statically from the diff/files; I did not run the test suite in this environment.
tokens used
167,020
**Findings (ordered by severity)**  
1. **High – custom `locationId:agentId` mappings are partially broken at runtime.** `parseLocationConfig` supports explicit agent IDs, but polling/lookup still hardcode `LOCATION_TO_AGENT`, so on-demand fetches can return empty for custom agent IDs. See `src/server/services/speedqueen.ts:744` and `src/server/services/speedqueen.ts:809`.  
2. **High – WebSocket connection race can create multiple WS clients/leaks under repeated UI activity.** `ensureWsConnected()` only checks `isConnected()`, but `connect()` returns before socket is open; repeated calls can replace `this.wsClient` while previous sockets are still connecting. See `src/server/services/speedqueen.ts:635`, `src/server/services/speedqueen.ts:640`, `src/server/services/speedqueen.ts:676`, `src/server/services/speedqueen.ts:343`.  
3. **Medium – wrong cycle can be sent after switching machines.** `selectedCycleId` is not reset on machine change and initialization is gated by stale `!selectedCycleId`, so a cycle from machine A can be sent to machine B. See `components/MachineDetailPanel.tsx:34`, `components/MachineDetailPanel.tsx:46`, `components/MachineDetailPanel.tsx:54`, `components/MachineDetailPanel.tsx:204`.  
4. **Medium – machine detail panel uses stale machine snapshot, not live status updates.** Dashboard stores full machine object in state, so panel does not track subsequent `machineStatus` polling updates. See `components/views/DashboardView.tsx:123`, `components/views/DashboardView.tsx:397`, `components/views/DashboardView.tsx:437`, and polling at `App.tsx:722`.  
5. **Medium – “Remove Out of Order” action is mislabeled / logic mismatch.** UI label toggles, but click always sends `set_out_of_order`; there is no opposite command. See `components/MachineDetailPanel.tsx:240` and `components/MachineDetailPanel.tsx:245`.  
6. **Medium (security) – upstream error details are sent back to clients.** REST client includes raw upstream response text in thrown errors, then routes return `err.message` directly. This can leak vendor/internal details. See `src/server/services/speedqueen.ts:186`, `src/server/index.ts:2009`, `src/server/index.ts:2043`, `src/server/index.ts:2058`.  
7. **Low (performance) – no in-flight dedupe for on-demand polls.** Concurrent requests can trigger repeated `pollLocation()` calls and unnecessary vendor API load/rate-limit pressure. See `src/server/services/speedqueen.ts:710` and `src/server/services/speedqueen.ts:723`.  
8. **Low (quality) – `SPEEDQUEEN_POLL_INTERVAL_MS` is effectively dead config.** It is parsed and passed through, but not used in real service polling fallback logic despite env docs implying it is. See `src/server/index.ts:185`, `src/server/services/speedqueen.ts:560`, `src/server/services/speedqueen.ts:585`, `src/server/services/speedqueen.ts:733`.

**Missing tests**  
1. No test that `loc_xxx:CustomAgent` works end-to-end for `getMachinesOnDemand` / polling (only parser is tested). See parser-only coverage at `src/server/__tests__/speedqueen.test.ts:93`.  
2. No test for repeated `notifyUiActivity()` during connection setup to catch duplicate WS client creation. Current lazy tests only check first activity path. See `src/server/__tests__/speedqueen-lazy.test.ts:78`.  
3. No frontend tests for machine detail panel behavior (cycle reset per machine, out-of-order toggle semantics, stale selected machine). Existing dashboard tests don’t cover new machine panel flows. See `components/__tests__/DashboardView.test.tsx:66`.  
4. New API tests run with `ALLOW_INSECURE=true`, so auth/role protections for new command/detail/status endpoints are not covered. See `src/server/__tests__/speedqueen-api.test.ts:9`.

I reviewed statically from the diff/files; I did not run the test suite in this environment.
