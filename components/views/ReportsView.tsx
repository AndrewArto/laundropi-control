import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Lock, Unlock, ChevronDown, Loader2 } from 'lucide-react';
import type { UiUser, Laundry } from '../../types';

export interface MachineEvent {
  id: number;
  timestamp: string;
  locationId: string;
  locationName: string | null;
  machineId: string;
  localId: string;
  agentId: string;
  machineType: string | null;
  statusId: string;
  previousStatusId: string | null;
  remainingSeconds: number | null;
  remainingVend: number | null;
  isDoorOpen: number | null;
  cycleId: string | null;
  cycleName: string | null;
  linkQuality: number | null;
  receivedAt: string | null;
  source: string;
  initiator: string | null;
  initiatorUser: string | null;
  commandType: string | null;
}

interface ReportsViewProps {
  authUser: UiUser | null;
  laundries: Laundry[];
}

const STATUS_OPTIONS = ['All', 'AVAILABLE', 'IN_USE', 'END_OF_CYCLE', 'DIAGNOSTIC', 'OUT_OF_ORDER', 'ERROR'];
const PAGE_SIZE = 200;

const statusColor = (statusId: string): string => {
  switch (statusId) {
    case 'AVAILABLE': return 'bg-emerald-500/20 text-emerald-400';
    case 'IN_USE': return 'bg-blue-500/20 text-blue-400';
    case 'END_OF_CYCLE': return 'bg-amber-500/20 text-amber-400';
    case 'OUT_OF_ORDER': return 'bg-red-500/20 text-red-400';
    case 'ERROR': return 'bg-red-500/20 text-red-400';
    case 'DIAGNOSTIC': return 'bg-purple-500/20 text-purple-400';
    default: return 'bg-slate-500/20 text-slate-400';
  }
};

const sourceBadge = (source: string): string => {
  return source === 'ws_push'
    ? 'bg-cyan-500/20 text-cyan-400'
    : 'bg-slate-500/20 text-slate-400';
};

const initiatorBadge = (initiator: string | null): string => {
  return initiator === 'admin'
    ? 'bg-amber-500/20 text-amber-400'
    : 'bg-slate-500/20 text-slate-400';
};

const formatCents = (cents: number | null): string => {
  if (cents === null || cents === undefined) return '-';
  return `€${(cents / 100).toFixed(2)}`;
};

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
};

const formatRemainingSeconds = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const todayStr = () => {
  const d = new Date();
  return d.toISOString().split('T')[0];
};

const sevenDaysAgoStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
};

export const ReportsView: React.FC<ReportsViewProps> = ({ authUser, laundries }) => {
  const [events, setEvents] = useState<MachineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  // Filters
  const [locationFilter, setLocationFilter] = useState('All');
  const [machineFilter, setMachineFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState(sevenDaysAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const locationOptions = ['All', ...laundries.map(l => l.id)];
  const machineOptions = ['All', ...Array.from({ length: 10 }, (_, i) => `w${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `d${i + 1}`)];

  const fetchEvents = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (locationFilter !== 'All') params.set('agentId', locationFilter);
      if (machineFilter !== 'All') params.set('machineId', machineFilter);
      if (dateFrom) params.set('from', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set('to', `${dateTo}T23:59:59.999Z`);
      const currentOffset = append ? offset : 0;
      params.set('limit', String(PAGE_SIZE + 1));
      if (currentOffset > 0) params.set('offset', String(currentOffset));

      const res = await fetch(`/api/machine-events?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MachineEvent[] = await res.json();

      const hasMoreResults = data.length > PAGE_SIZE;
      const pageData = hasMoreResults ? data.slice(0, PAGE_SIZE) : data;

      // Apply client-side status filter
      const filtered = statusFilter !== 'All'
        ? pageData.filter(e => e.statusId === statusFilter)
        : pageData;

      if (append) {
        setEvents(prev => [...prev, ...filtered]);
      } else {
        setEvents(filtered);
      }
      setHasMore(hasMoreResults);
      setOffset(currentOffset + pageData.length);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [locationFilter, machineFilter, statusFilter, dateFrom, dateTo, offset]);

  // Fetch on mount and when filters change
  useEffect(() => {
    setOffset(0);
    fetchEvents(false);
  }, [locationFilter, machineFilter, statusFilter, dateFrom, dateTo]);

  const handleLoadMore = () => {
    fetchEvents(true);
  };

  if (authUser?.role !== 'admin' && authUser?.role !== 'viewer') {
    return (
      <div className="text-center text-slate-500 py-12">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>Access restricted to admin and viewer roles.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-cyan-400" />
        Machine Events
      </h2>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
        {/* Location */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Location</label>
          <div className="relative">
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 appearance-none pr-6"
            >
              {locationOptions.map(o => <option key={o} value={o}>{o === 'All' ? 'All Locations' : o}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Machine */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Machine</label>
          <div className="relative">
            <select
              value={machineFilter}
              onChange={e => setMachineFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 appearance-none pr-6"
            >
              {machineOptions.map(o => <option key={o} value={o}>{o === 'All' ? 'All Machines' : o}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Date From */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Status</label>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 appearance-none pr-6"
            >
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o === 'All' ? 'All Statuses' : o}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 mb-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && events.length === 0 && (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading events...
        </div>
      )}

      {/* No results */}
      {!loading && events.length === 0 && !error && (
        <div className="text-center text-slate-500 py-12">
          <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No events found for the selected filters.</p>
        </div>
      )}

      {/* Desktop table (hidden on small screens) */}
      {events.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-slate-300">
            <thead>
              <tr className="border-b border-slate-700 text-slate-500">
                <th className="text-left py-2 px-1 font-medium">Time</th>
                <th className="text-left py-2 px-1 font-medium">Location</th>
                <th className="text-left py-2 px-1 font-medium">Machine</th>
                <th className="text-left py-2 px-1 font-medium">Type</th>
                <th className="text-left py-2 px-1 font-medium">Status</th>
                <th className="text-left py-2 px-1 font-medium">Previous</th>
                <th className="text-left py-2 px-1 font-medium">Remaining</th>
                <th className="text-left py-2 px-1 font-medium">Cycle Price</th>
                <th className="text-center py-2 px-1 font-medium">Door</th>
                <th className="text-left py-2 px-1 font-medium">Cycle</th>
                <th className="text-left py-2 px-1 font-medium">Link</th>
                <th className="text-left py-2 px-1 font-medium">Source</th>
                <th className="text-left py-2 px-1 font-medium">Initiator</th>
                <th className="text-left py-2 px-1 font-medium">User</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-1.5 px-1 whitespace-nowrap">{formatTime(e.timestamp)}</td>
                  <td className="py-1.5 px-1 whitespace-nowrap">{e.locationName || e.agentId}</td>
                  <td className="py-1.5 px-1 font-mono">{e.localId}</td>
                  <td className="py-1.5 px-1">{e.machineType || '-'}</td>
                  <td className="py-1.5 px-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(e.statusId)}`}>
                      {e.statusId}
                    </span>
                  </td>
                  <td className="py-1.5 px-1">
                    {e.previousStatusId ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(e.previousStatusId)}`}>
                        {e.previousStatusId}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-1.5 px-1 font-mono">{formatRemainingSeconds(e.remainingSeconds)}</td>
                  <td className="py-1.5 px-1">{formatCents(e.remainingVend)}</td>
                  <td className="py-1.5 px-1 text-center">
                    {e.isDoorOpen === null ? '-' : e.isDoorOpen ? (
                      <Unlock className="w-3.5 h-3.5 inline text-emerald-400" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 inline text-slate-500" />
                    )}
                  </td>
                  <td className="py-1.5 px-1">{e.cycleName || '-'}</td>
                  <td className="py-1.5 px-1">{e.linkQuality !== null ? `${e.linkQuality}%` : '-'}</td>
                  <td className="py-1.5 px-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadge(e.source)}`}>
                      {e.source === 'ws_push' ? 'WS' : 'REST'}
                    </span>
                  </td>
                  <td className="py-1.5 px-1">
                    {e.initiator ? (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${initiatorBadge(e.initiator)}`}>
                        {e.initiator}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="py-1.5 px-1">{e.initiatorUser || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile card layout (hidden on md+) */}
      {events.length > 0 && (
        <div className="md:hidden space-y-2">
          {events.map(e => (
            <div key={e.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-slate-500">{formatTime(e.timestamp)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(e.statusId)}`}>
                  {e.statusId}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-slate-200">{e.locationName || e.agentId}</span>
                <span className="text-xs font-mono text-cyan-400">{e.localId}</span>
                <span className="text-[10px] text-slate-500">{e.machineType || ''}</span>
              </div>
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px]">
                {e.previousStatusId && (
                  <div>
                    <span className="text-slate-500">Prev: </span>
                    <span className={`px-1 py-0.5 rounded ${statusColor(e.previousStatusId)}`}>{e.previousStatusId}</span>
                  </div>
                )}
                {e.remainingSeconds !== null && (
                  <div>
                    <span className="text-slate-500">Time: </span>
                    <span className="text-slate-300 font-mono">{formatRemainingSeconds(e.remainingSeconds)}</span>
                  </div>
                )}
                {e.remainingVend !== null && (
                  <div>
                    <span className="text-slate-500">Price: </span>
                    <span className="text-slate-300">{formatCents(e.remainingVend)}</span>
                  </div>
                )}
                {e.isDoorOpen !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500">Door: </span>
                    {e.isDoorOpen ? <Unlock className="w-3 h-3 text-emerald-400" /> : <Lock className="w-3 h-3 text-slate-500" />}
                  </div>
                )}
                {e.cycleName && (
                  <div>
                    <span className="text-slate-500">Cycle: </span>
                    <span className="text-slate-300">{e.cycleName}</span>
                  </div>
                )}
                {e.linkQuality !== null && (
                  <div>
                    <span className="text-slate-500">Link: </span>
                    <span className="text-slate-300">{e.linkQuality}%</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-700">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadge(e.source)}`}>
                  {e.source === 'ws_push' ? 'WS' : 'REST'}
                </span>
                {e.initiator && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${initiatorBadge(e.initiator)}`}>
                    {e.initiator}
                  </span>
                )}
                {e.initiatorUser && (
                  <span className="text-[10px] text-slate-500">{e.initiatorUser}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-300 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading...
              </span>
            ) : (
              `Load more (${events.length} shown)`
            )}
          </button>
        </div>
      )}

      {/* Count */}
      {events.length > 0 && !loading && (
        <p className="text-[10px] text-slate-600 mt-2 text-right">{events.length} event{events.length !== 1 ? 's' : ''} shown</p>
      )}
    </div>
  );
};
