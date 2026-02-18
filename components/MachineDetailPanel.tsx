import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Play, Square, AlertTriangle, Ban, Clock, Lock, LockOpen, Loader2, CheckCircle, XCircle, WashingMachine, Wind } from 'lucide-react';
import { LaundryMachine, SpeedQueenMachineCycle, SpeedQueenCommandType } from '../types';
import { ApiService } from '../services/api';

interface MachineDetailPanelProps {
  agentId: string;
  machine: LaundryMachine;
  onClose: () => void;
  isSpeedQueen: boolean;
  isViewer: boolean;
}

type CommandFeedback = {
  status: 'pending' | 'success' | 'failed';
  message: string;
};

const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const MachineDetailPanel: React.FC<MachineDetailPanelProps> = ({
  agentId,
  machine,
  onClose,
  isSpeedQueen,
  isViewer,
}) => {
  const [cycles, setCycles] = useState<SpeedQueenMachineCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>('');
  const [dryerMinutes, setDryerMinutes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [commandFeedback, setCommandFeedback] = useState<CommandFeedback | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(machine.remainingSeconds ?? 0);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up feedback timer on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Reset cycle selection when machine changes
  useEffect(() => {
    setSelectedCycleId('');
    setCycles([]);
  }, [agentId, machine.id]);

  // Fetch machine detail & cycles when panel opens
  useEffect(() => {
    if (!isSpeedQueen) return;
    setLoading(true);
    ApiService.getMachineDetail(agentId, machine.id)
      .then((data) => {
        setCycles(data.cycles || []);
        if (data.cycles?.length > 0) {
          setSelectedCycleId(data.cycles[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load machine detail:', err);
      })
      .finally(() => setLoading(false));
  }, [agentId, machine.id, isSpeedQueen]);

  // Countdown timer for remaining seconds
  useEffect(() => {
    setRemainingSeconds(machine.remainingSeconds ?? 0);
  }, [machine.remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds > 0]);

  const sendCommand = useCallback(async (commandType: SpeedQueenCommandType, params?: Record<string, unknown>) => {
    setCommandFeedback({ status: 'pending', message: 'Sending command...' });
    try {
      const result = await ApiService.sendMachineCommand(agentId, machine.id, commandType, params);
      if (result.ok) {
        setCommandFeedback({ status: 'success', message: 'Command sent successfully' });
      } else {
        setCommandFeedback({ status: 'failed', message: 'Command failed' });
      }
    } catch (err: any) {
      setCommandFeedback({ status: 'failed', message: err.message || 'Command failed' });
    }
    // Clear feedback after 4s (safe: cleared on unmount)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setCommandFeedback(null), 4000);
  }, [agentId, machine.id]);

  const isDryer = machine.type === 'dryer';

  const statusColor = {
    idle: 'text-slate-400 border-slate-600',
    running: 'text-emerald-300 border-emerald-500',
    error: 'text-red-300 border-red-500',
    out_of_order: 'text-amber-300 border-amber-500',
    unknown: 'text-slate-500 border-slate-700',
  }[machine.status] || 'text-slate-500 border-slate-700';

  const statusBg = {
    idle: 'bg-slate-500/10',
    running: 'bg-emerald-500/10',
    error: 'bg-red-500/10',
    out_of_order: 'bg-amber-500/10',
    unknown: 'bg-slate-800/50',
  }[machine.status] || 'bg-slate-800/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            {machine.type === 'washer' ? (
              <WashingMachine className="w-5 h-5 text-blue-400" />
            ) : (
              <Wind className="w-5 h-5 text-orange-400" />
            )}
            <span className="text-white font-semibold">{machine.label}</span>
            {machine.model && (
              <span className="text-xs text-slate-500">({machine.model})</span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Section */}
        <div className="px-4 py-3 space-y-3">
          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusColor} ${statusBg}`}>
            <span className="text-sm font-medium uppercase">{machine.status}</span>
            {machine.status === 'running' && remainingSeconds > 0 && (
              <div className="flex items-center gap-1 ml-auto text-emerald-300">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-mono">{formatTime(remainingSeconds)}</span>
              </div>
            )}
          </div>

          {/* Detail rows */}
          {isSpeedQueen && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                {machine.isDoorOpen ? (
                  <LockOpen className="w-4 h-4 text-amber-400" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-500" />
                )}
                <span>Door: {machine.isDoorOpen ? 'Unlocked' : 'Locked'}</span>
              </div>
              {machine.selectedCycle && (
                <div className="text-slate-400">
                  Cycle: <span className="text-slate-200">{machine.selectedCycle.name}</span>
                </div>
              )}
              {machine.remainingVend !== undefined && machine.remainingVend > 0 && (
                <div className="text-slate-400">
                  Cycle price: €<span className="text-slate-200">{(machine.remainingVend / 100).toFixed(2)}</span>
                </div>
              )}
              {machine.speedqueenId && (
                <div className="text-slate-500 text-xs col-span-2">
                  SQ ID: {machine.speedqueenId}
                </div>
              )}
            </div>
          )}

          {/* Error details */}
          {machine.status === 'error' && (machine.errorName || machine.errorCode) && (
            <div className="bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-red-300">
                <AlertTriangle className="w-4 h-4" />
                <span>Error: {machine.errorName || `Code ${machine.errorCode}`}</span>
              </div>
              {machine.errorType && (
                <div className="text-red-400 text-xs mt-1">Type: {machine.errorType}</div>
              )}
            </div>
          )}
        </div>

        {/* Actions Section */}
        {isSpeedQueen && !isViewer && (
          <div className="px-4 py-3 border-t border-slate-700 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">Actions</div>

            {/* AVAILABLE state: Start Cycle */}
            {machine.status === 'idle' && (
              <div className="space-y-2">
                {cycles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedCycleId}
                      onChange={(e) => setSelectedCycleId(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-md px-3 py-2 focus:border-indigo-500 focus:outline-none"
                    >
                      {cycles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.vendPrice ? ` (${(c.vendPrice / 100).toFixed(2)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={isDryer ? "flex items-center gap-2" : ""}>
                  {isDryer && (
                    <input
                      type="number"
                      value={dryerMinutes}
                      onChange={(e) => setDryerMinutes(e.target.value)}
                      placeholder="Min"
                      min="1"
                      max="120"
                      className="w-20 bg-slate-900 border border-slate-600 text-slate-200 text-sm rounded-md px-3 py-2 placeholder-slate-600 focus:border-indigo-500 focus:outline-none flex-shrink-0"
                    />
                  )}
                  <button
                    onClick={() => {
                      const mins = parseInt(dryerMinutes, 10);
                      if (isDryer && mins > 0) {
                        sendCommand('start_dryer_with_time', { minutes: mins });
                      } else {
                        sendCommand('remote_start', selectedCycleId ? { cycleId: selectedCycleId } : undefined);
                      }
                    }}
                    disabled={commandFeedback?.status === 'pending'}
                    className="flex-1 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    {isDryer && parseInt(dryerMinutes, 10) > 0 ? `Start Dryer (${dryerMinutes} min)` : 'Start Cycle'}
                  </button>
                </div>
              </div>
            )}

            {/* IN_USE state: Show timer + Stop */}
            {machine.status === 'running' && (
              <button
                onClick={() => sendCommand('remote_stop')}
                disabled={commandFeedback?.status === 'pending'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            )}

            {/* ERROR state: Clear Error */}
            {machine.status === 'error' && (
              <button
                onClick={() => sendCommand('clear_error')}
                disabled={commandFeedback?.status === 'pending'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                Clear Error
              </button>
            )}

            {/* Any state: Out of Order toggle */}
            <button
              onClick={() => sendCommand('set_out_of_order', {
                outOfOrder: machine.status !== 'out_of_order',
              })}
              disabled={commandFeedback?.status === 'pending'}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white text-sm disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              {machine.status === 'out_of_order' ? 'Remove Out of Order' : 'Set Out of Order'}
            </button>

            {/* Command feedback */}
            {commandFeedback && (
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  commandFeedback.status === 'pending'
                    ? 'bg-slate-700/50 text-slate-300'
                    : commandFeedback.status === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/40 text-emerald-300'
                    : 'bg-red-500/10 border border-red-500/40 text-red-300'
                }`}
              >
                {commandFeedback.status === 'pending' && <Loader2 className="w-4 h-4 animate-spin" />}
                {commandFeedback.status === 'success' && <CheckCircle className="w-4 h-4" />}
                {commandFeedback.status === 'failed' && <XCircle className="w-4 h-4" />}
                <span>{commandFeedback.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-4 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading details...
          </div>
        )}
      </div>
    </div>
  );
};
