import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Play, FastForward, Square, CheckCircle, Link as LinkIcon } from 'lucide-react';

interface PaymentType {
  value: number;
  label: string;
}

interface CalculationResult {
  totalRevenue: number;
  cashRevenue: number;
  baseRevenue: number;
  invoiceAmount: number;
  numInvoices: number;
  remainder: number;
  isCash: boolean;
}

interface LogEntry {
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'dim';
  link?: string;
}

const apiFetch = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, credentials: 'include' });

interface InvoicingViewProps {
  readOnly?: boolean;
}

export const InvoicingView: React.FC<InvoicingViewProps> = ({ readOnly = false }) => {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);

  const [stripeRevenue, setStripeRevenue] = useState('');
  const [stripePercent, setStripePercent] = useState('30');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentType, setPaymentType] = useState(0);

  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);

  const shouldStop = useRef(false);
  const createdCountRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Check connection on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/invoicing/status');
        const data = await res.json();
        setConnected(data.connected);
        setTotalDocuments(data.totalDocuments || 0);
        if (data.paymentTypes) setPaymentTypes(data.paymentTypes);
      } catch {
        setConnected(false);
      }
    })();
  }, []);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info', link?: string) => {
    const time = new Date().toLocaleTimeString('ru-RU');
    setLog(prev => [...prev, { time, message, type, link }]);
  }, []);

  const handleCalculate = useCallback(async () => {
    const rev = parseFloat(stripeRevenue);
    const pct = parseFloat(stripePercent);
    if (!rev || !pct) return;

    try {
      const res = await apiFetch('/api/invoicing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeRevenue: rev, stripePercent: pct, paymentType }),
      });
      const data = await res.json();
      if (data.error) {
        addLog(data.error, 'error');
        return;
      }
      setCalculation(data);
      createdCountRef.current = 0;
      setCreatedCount(0);
      setLog([]);

      const ptLabel = paymentTypes.find(p => p.value === paymentType)?.label || String(paymentType);
      if (data.isCash) {
        addLog(`Stripe €${rev} (${pct}%) → Cash €${data.cashRevenue} → ${data.numInvoices} invoices • ${ptLabel}`, 'info');
      } else {
        addLog(`Cards €${rev} → ${data.numInvoices} invoices • ${ptLabel}`, 'info');
      }
      if (data.remainder > 0) {
        addLog(`Remainder €${data.remainder} (not enough for another invoice)`, 'dim');
      }
    } catch (err: any) {
      addLog(err.message, 'error');
    }
  }, [stripeRevenue, stripePercent, paymentType, paymentTypes, addLog]);

  const createOne = useCallback(async (): Promise<boolean> => {
    if (!calculation || createdCountRef.current >= calculation.numInvoices) return false;

    const num = createdCountRef.current + 1;
    addLog(`Creating invoice #${num}/${calculation.numInvoices}...`, 'dim');

    try {
      const res = await apiFetch('/api/invoicing/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: invoiceDate, paymentType }),
      });
      const data = await res.json();

      if (data.AppStatusCode === 200) {
        const docId = data.AppResponse?.data?.id;
        const link = data.AppResponse?.permanentUrl || '';
        createdCountRef.current = num;
        setCreatedCount(num);
        addLog(`#${num} • ID: ${docId}`, 'success', link);
        return true;
      } else {
        const errors = data.AppResponse?.errors;
        addLog(`#${num}: ${typeof errors === 'object' ? JSON.stringify(errors) : errors}`, 'error');
        return false;
      }
    } catch (err: any) {
      addLog(`#${num}: ${err.message}`, 'error');
      return false;
    }
  }, [calculation, invoiceDate, paymentType, addLog]);

  const handleCreateNext = useCallback(async () => {
    const ok = await createOne();
    if (ok && calculation && createdCount + 1 >= calculation.numInvoices) {
      addLog('All invoices created!', 'success');
    }
  }, [createOne, calculation, createdCount, addLog]);

  const handleCreateAll = useCallback(async () => {
    if (!calculation) return;
    shouldStop.current = false;
    setRunning(true);

    while (createdCountRef.current < calculation.numInvoices && !shouldStop.current) {
      const ok = await createOne();
      if (!ok) {
        addLog('Stopped due to error', 'error');
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }

    setRunning(false);
    if (createdCountRef.current >= calculation.numInvoices) {
      addLog('All invoices created!', 'success');
    }
  }, [calculation, createOne, addLog]);

  const handleStop = useCallback(() => {
    shouldStop.current = true;
    addLog('Stopping...', 'info');
  }, [addLog]);

  const totalInvoices = calculation?.numInvoices ?? 0;
  const progress = totalInvoices > 0 ? (createdCount / totalInvoices) * 100 : 0;
  const allDone = totalInvoices > 0 && createdCount >= totalInvoices;

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
        connected === null ? 'bg-slate-800 text-slate-400' :
        connected ? 'bg-emerald-900/40 text-emerald-400' :
        'bg-red-900/40 text-red-400'
      }`}>
        {connected === null && '⏳ Checking Fact.pt connection...'}
        {connected === true && `✓ Fact.pt connected • ${totalDocuments} documents`}
        {connected === false && '✗ Fact.pt not connected — check FACTPT_API_KEY in .env'}
      </div>

      {/* Calculator */}
      <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Invoice Calculator
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Stripe (€)</label>
            <input
              type="number"
              value={stripeRevenue}
              onChange={e => setStripeRevenue(e.target.value)}
              placeholder="1500.00"
              step="0.01"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Stripe Share (%)</label>
            <input
              type="number"
              value={stripePercent}
              onChange={e => setStripePercent(e.target.value)}
              placeholder="30"
              step="0.1"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={e => setInvoiceDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Payment Type</label>
            <select
              value={paymentType}
              onChange={e => setPaymentType(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              {paymentTypes.map(pt => (
                <option key={pt.value} value={pt.value}>{pt.value} — {pt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleCalculate}
          disabled={!stripeRevenue || !stripePercent || !connected || readOnly}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Calculate
        </button>

        {/* Stats */}
        {calculation && (
          <div className="grid grid-cols-4 gap-2 pt-2">
            {[
              { label: 'Total Revenue', value: `€${calculation.totalRevenue.toLocaleString('pt-PT')}` },
              { label: calculation.isCash ? 'Cash' : 'Cards', value: `€${calculation.baseRevenue.toLocaleString('pt-PT')}` },
              { label: 'Invoices', value: String(calculation.numInvoices) },
              { label: 'Remainder', value: `€${calculation.remainder.toLocaleString('pt-PT')}` },
            ].map(s => (
              <div key={s.label} className="bg-slate-900 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-amber-400">{s.value}</div>
                <div className="text-[10px] text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoice composition */}
      <details className="bg-slate-800/50 rounded-xl">
        <summary className="px-4 py-3 text-sm font-semibold text-slate-400 cursor-pointer hover:text-slate-200">
          📋 Invoice Composition (€99.94)
        </summary>
        <div className="px-4 pb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700">
                <th className="text-left py-1">Ref</th>
                <th className="text-left">Description</th>
                <th className="text-right">Price</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr><td>LAV9KG</td><td>Wash 9 kg</td><td className="text-right">€3,25</td><td className="text-right">5</td><td className="text-right">€16,25</td></tr>
              <tr><td>LAV11KG</td><td>Wash 11 kg</td><td className="text-right">€4,88</td><td className="text-right">4</td><td className="text-right">€19,52</td></tr>
              <tr><td>LAV15KG</td><td>Wash 15 kg</td><td className="text-right">€5,69</td><td className="text-right">3</td><td className="text-right">€17,07</td></tr>
              <tr><td>LAV18KG</td><td>Wash 18 kg</td><td className="text-right">€7,32</td><td className="text-right">2</td><td className="text-right">€14,64</td></tr>
              <tr><td>SEC15KG</td><td>Dry 15 kg</td><td className="text-right">€0,81</td><td className="text-right">17</td><td className="text-right">€13,77</td></tr>
              <tr className="font-semibold border-t border-slate-700">
                <td colSpan={4}>Total (excl. VAT / incl. 23% VAT)</td>
                <td className="text-right">€81,25 / €99,94</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      {/* Generator */}
      {calculation && calculation.numInvoices > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-400">Generation</h3>
            <span className="text-xs text-slate-500">
              {createdCount} / {totalInvoices}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            {!running && !allDone && (
              <>
                <button
                  onClick={handleCreateNext}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Next
                </button>
                <button
                  onClick={handleCreateAll}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  Create All
                </button>
              </>
            )}
            {running && (
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            )}
            {allDone && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                All invoices created
              </span>
            )}
          </div>

          {/* Log */}
          <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
            {log.length === 0 && <div className="text-slate-600">Waiting...</div>}
            {log.map((entry, i) => (
              <div key={i} className={`flex gap-2 ${
                entry.type === 'success' ? 'text-emerald-400' :
                entry.type === 'error' ? 'text-red-400' :
                entry.type === 'dim' ? 'text-slate-500' :
                'text-sky-400'
              }`}>
                <span className="text-slate-600 flex-shrink-0">[{entry.time}]</span>
                <span>{entry.message}</span>
                {entry.link && (
                  <a href={entry.link} target="_blank" rel="noopener noreferrer"
                     className="text-sky-400 hover:text-sky-300 flex-shrink-0">
                    <LinkIcon className="w-3 h-3 inline" />
                  </a>
                )}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};
