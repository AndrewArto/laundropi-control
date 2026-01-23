import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, FileText, Check, ChevronDown, ChevronRight, Trash2, ArrowLeft, Ban, Loader2, Undo2 } from 'lucide-react';
import type { ExpenditureImport, ExpenditureTransaction, Laundry } from '../../types';
import { GENERAL_LAUNDRY } from '../../types';
import type { ReconciliationSummary, PendingChange } from '../../hooks/useReconciliation';
import { formatTimestamp } from '../../utils/formatting';

interface BankImportViewProps {
  laundries: Laundry[];
  imports: ExpenditureImport[];
  activeImport: ExpenditureImport | null;
  transactions: ExpenditureTransaction[];
  summary: ReconciliationSummary | null;
  loading: boolean;
  uploading: boolean;
  applying: boolean;
  error: string | null;
  pendingChanges: Map<string, PendingChange>;
  hasUnsavedChanges: boolean;

  onUploadCsv: (file: File) => Promise<{ success: boolean; error?: string; warnings?: string[] }>;
  onLoadImport: (importId: string) => Promise<void>;
  onAssignTransaction: (transactionId: string, agentId: string, entryDate?: string, comment?: string) => void;
  onAssignStripeCredit: (transactionId: string, agentId: string, entryDate?: string) => void;
  onIgnoreTransaction: (transactionId: string, notes?: string) => void;
  onUnignoreTransaction: (transactionId: string) => void;
  onUndoChange: (transactionId: string) => void;
  onApplyChanges: () => Promise<boolean | void>;
  onCompleteImport: (notes?: string) => Promise<void>;
  onCancelImport: (notes?: string) => Promise<void>;
  onDeleteImport: (importId: string) => Promise<void>;
  onClearActiveImport: () => void;
}

const formatMoney = (amount: number) => `€${amount.toFixed(2)}`;

const formatDateShort = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const BankImportView: React.FC<BankImportViewProps> = ({
  laundries,
  imports,
  activeImport,
  transactions,
  summary,
  loading,
  uploading,
  applying,
  error,
  pendingChanges,
  hasUnsavedChanges,
  onUploadCsv,
  onLoadImport,
  onAssignTransaction,
  onAssignStripeCredit,
  onIgnoreTransaction,
  onUnignoreTransaction,
  onUndoChange,
  onApplyChanges,
  onCompleteImport,
  onCancelImport,
  onDeleteImport,
  onClearActiveImport,
}) => {
  // Include Fix cost center in the laundries list for assignment
  const allLaundries = useMemo(() => [...laundries, GENERAL_LAUNDRY], [laundries]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showStripe, setShowStripe] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const [showAssigned, setShowAssigned] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);

  // Track items being assigned with three phases: selected -> animating -> flyingOut
  const [assigningItems, setAssigningItems] = useState<Map<string, { agentId: string; type: 'expense' | 'stripe'; phase: 'selected' | 'animating' | 'flyingOut' }>>(new Map());

  // Handle expense assignment with three-phase animation
  const handleAssignExpense = useCallback((txId: string, agentId: string) => {
    // Phase 1: Show selected button (400ms)
    setAssigningItems(prev => new Map(prev).set(txId, { agentId, type: 'expense', phase: 'selected' }));
    setTimeout(() => {
      // Phase 2: Show checkmark animation (600ms)
      setAssigningItems(prev => new Map(prev).set(txId, { agentId, type: 'expense', phase: 'animating' }));
      setTimeout(() => {
        // Phase 3: Fly out animation (400ms)
        setAssigningItems(prev => new Map(prev).set(txId, { agentId, type: 'expense', phase: 'flyingOut' }));
        setTimeout(() => {
          onAssignTransaction(txId, agentId);
          setAssigningItems(prev => {
            const next = new Map(prev);
            next.delete(txId);
            return next;
          });
        }, 400);
      }, 600);
    }, 400);
  }, [onAssignTransaction]);

  // Handle Stripe assignment with three-phase animation
  const handleAssignStripe = useCallback((txId: string, agentId: string) => {
    // Phase 1: Show selected button (400ms)
    setAssigningItems(prev => new Map(prev).set(txId, { agentId, type: 'stripe', phase: 'selected' }));
    setTimeout(() => {
      // Phase 2: Show checkmark animation (600ms)
      setAssigningItems(prev => new Map(prev).set(txId, { agentId, type: 'stripe', phase: 'animating' }));
      setTimeout(() => {
        // Phase 3: Fly out animation (400ms)
        setAssigningItems(prev => new Map(prev).set(txId, { agentId, type: 'stripe', phase: 'flyingOut' }));
        setTimeout(() => {
          onAssignStripeCredit(txId, agentId);
          setAssigningItems(prev => {
            const next = new Map(prev);
            next.delete(txId);
            return next;
          });
        }, 400);
      }, 600);
    }, 400);
  }, [onAssignStripeCredit]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      const result = await onUploadCsv(file);
      if (result.warnings?.length) {
        setUploadWarnings(result.warnings);
      }
    }
  }, [onUploadCsv]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const result = await onUploadCsv(file);
      if (result.warnings?.length) {
        setUploadWarnings(result.warnings);
      }
    }
    e.target.value = '';
  }, [onUploadCsv]);

  // If we have an active import, show the reconciliation view
  if (activeImport) {
    const newExpenses = transactions.filter(t => t.reconciliationStatus === 'new' && t.transactionType === 'expense');
    const newStripeCredits = transactions.filter(t => t.reconciliationStatus === 'new' && t.transactionType === 'stripe_credit');
    const newTransactions = [...newExpenses, ...newStripeCredits];
    const assignedTransactions = transactions.filter(t => t.reconciliationStatus === 'existing');
    const ignoredTransactions = transactions.filter(t => t.reconciliationStatus === 'ignored');
    const canComplete = newTransactions.length === 0;
    const isCompleted = activeImport.status === 'completed';
    const isCancelled = activeImport.status === 'cancelled';

    return (
      <div className="pb-24 px-4 py-6 max-w-full sm:max-w-4xl mx-auto">
        {/* Header - stacked on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onClearActiveImport}
              className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-100 truncate">{activeImport.fileName}</h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {formatTimestamp(activeImport.importedAt)} · {activeImport.importedBy}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto">
            {hasUnsavedChanges && (
              <span className="px-2 py-1 rounded text-xs font-medium bg-amber-500/20 text-amber-400">
                {pendingChanges.size} unsaved
              </span>
            )}
            <span className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
              isCompleted ? 'bg-green-500/20 text-green-400' :
              isCancelled ? 'bg-red-500/20 text-red-400' :
              'bg-amber-500/20 text-amber-400'
            }`}>
              {activeImport.status}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <div className="text-2xl font-bold text-slate-100">{summary.total}</div>
              <div className="text-sm text-slate-400">Total</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-amber-500/50">
              <div className="text-2xl font-bold text-amber-400">{summary.new}</div>
              <div className="text-sm text-slate-400">New</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 border border-green-500/50">
              <div className="text-2xl font-bold text-green-400">{summary.existing}</div>
              <div className="text-sm text-slate-400">Assigned</div>
            </div>
            <button
              onClick={() => setShowIgnored(!showIgnored)}
              className="bg-slate-800 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-slate-400">{summary.ignored}</div>
                {showIgnored ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
              </div>
              <div className="text-sm text-slate-400">Ignored</div>
            </button>
          </div>
        )}

        {/* Stripe Credits - assign to laundry revenue */}
        {newStripeCredits.length > 0 && !isCompleted && !isCancelled && (
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
              <button
                onClick={() => setShowStripe(!showStripe)}
                className="flex-1 text-left text-base sm:text-lg font-semibold text-slate-100 flex items-center gap-2 hover:text-slate-200"
              >
                {showStripe ? <ChevronDown className="w-5 h-5 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 flex-shrink-0" />}
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></span>
                <span>Stripe Payments ({newStripeCredits.length})</span>
                <span className="text-xs text-slate-400 font-normal ml-2 hidden sm:inline">Assign to laundry revenue</span>
              </button>
              <button
                onClick={() => {
                  // Assign all to default laundry (second laundry for Stripe, or first if only one)
                  const defaultIdx = allLaundries.length > 2 ? 1 : 0;
                  const defaultLaundry = allLaundries[defaultIdx];
                  if (defaultLaundry) {
                    newStripeCredits.forEach(tx => {
                      if (!pendingChanges.has(tx.id) && !assigningItems.has(tx.id)) {
                        onAssignStripeCredit(tx.id, defaultLaundry.id);
                      }
                    });
                  }
                }}
                className="w-full sm:w-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium whitespace-nowrap"
              >
                Process All → {allLaundries[allLaundries.length > 2 ? 1 : 0]?.name || 'Default'}
              </button>
            </div>
            {showStripe && (
              <div className="space-y-2">
                {newStripeCredits.map(tx => {
                  const assigning = assigningItems.get(tx.id);
                  const isAnimating = assigning?.phase === 'animating';
                  const isFlyingOut = assigning?.phase === 'flyingOut';
                  const assignedLaundry = assigning ? allLaundries.find(l => l.id === assigning.agentId)?.name : null;

                  return (
                    <div
                      key={tx.id}
                      className={`bg-blue-900/20 rounded-lg p-3 sm:p-4 border transition-all duration-400 ease-out ${
                        isFlyingOut
                          ? 'opacity-0 translate-y-8 scale-95 max-h-0 py-0 my-0 overflow-hidden border-transparent'
                          : isAnimating
                          ? 'border-green-500/50 bg-green-900/20 opacity-80 scale-[0.98]'
                          : 'border-blue-500/30'
                      }`}
                      style={{
                        transition: isFlyingOut
                          ? 'all 400ms cubic-bezier(0.4, 0, 0.2, 1), max-height 400ms ease-out 100ms'
                          : 'all 300ms ease-out'
                      }}
                    >
                      {/* Desktop layout */}
                      <div className="hidden sm:flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-slate-400 text-sm">{formatDateShort(tx.transactionDate)}</span>
                            <span className="font-semibold text-green-400">+{formatMoney(tx.amount)}</span>
                            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">STRIPE</span>
                          </div>
                          <p className="text-slate-300 text-sm truncate">{tx.description}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isAnimating ? (
                            <div className="flex items-center gap-2 text-green-400">
                              <Check className="w-5 h-5" />
                              <span className="text-sm font-medium">→ {assignedLaundry}</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-slate-400 text-sm">Add to</span>
                              {(() => {
                                // Check if this item is in 'selected' phase
                                const selectedByClick = assigning?.phase === 'selected' ? assigning.agentId : null;
                                const pending = pendingChanges.get(tx.id);
                                const selectedAgentId = selectedByClick || pending?.agentId;
                                // Default: second laundry for Stripe (or first if only one)
                                const defaultIdx = allLaundries.length > 2 ? 1 : 0;

                                return allLaundries.map((l, idx) => {
                                  const isSelected = selectedAgentId
                                    ? l.id === selectedAgentId
                                    : idx === defaultIdx;

                                  return (
                                    <button
                                      key={l.id}
                                      onClick={() => handleAssignStripe(tx.id, l.id)}
                                      disabled={!!assigning}
                                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                        isSelected
                                          ? 'bg-blue-600 text-white'
                                          : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                      } ${assigning ? 'cursor-not-allowed' : ''}`}
                                    >
                                      {l.name}
                                    </button>
                                  );
                                });
                              })()}
                              <button
                                onClick={() => onIgnoreTransaction(tx.id)}
                                disabled={!!assigning}
                                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded disabled:cursor-not-allowed"
                                title="Ignore"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs">{formatDateShort(tx.transactionDate)}</span>
                            <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">STRIPE</span>
                          </div>
                          <span className="font-semibold text-green-400">+{formatMoney(tx.amount)}</span>
                        </div>
                        <p className="text-slate-300 text-sm line-clamp-2">{tx.description}</p>
                        {isAnimating ? (
                          <div className="flex items-center gap-2 text-green-400 justify-center py-1">
                            <Check className="w-5 h-5" />
                            <span className="text-sm font-medium">→ {assignedLaundry}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-1">
                            {(() => {
                              const selectedByClick = assigning?.phase === 'selected' ? assigning.agentId : null;
                              const pending = pendingChanges.get(tx.id);
                              const selectedAgentId = selectedByClick || pending?.agentId;
                              const defaultIdx = allLaundries.length > 2 ? 1 : 0;

                              return allLaundries.map((l, idx) => {
                                const isSelected = selectedAgentId
                                  ? l.id === selectedAgentId
                                  : idx === defaultIdx;

                                return (
                                  <button
                                    key={l.id}
                                    onClick={() => handleAssignStripe(tx.id, l.id)}
                                    disabled={!!assigning}
                                    className={`flex-1 px-2 py-2 rounded text-xs font-medium transition-colors ${
                                      isSelected
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-700 text-slate-200'
                                    } ${assigning ? 'cursor-not-allowed' : ''}`}
                                  >
                                    {l.name}
                                  </button>
                                );
                              });
                            })()}
                            <button
                              onClick={() => onIgnoreTransaction(tx.id)}
                              disabled={!!assigning}
                              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded disabled:cursor-not-allowed"
                              title="Ignore"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* New Expenses - needs action */}
        {newExpenses.length > 0 && !isCompleted && !isCancelled && (
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
              <button
                onClick={() => setShowExpenses(!showExpenses)}
                className="flex-1 text-left text-base sm:text-lg font-semibold text-slate-100 flex items-center gap-2 hover:text-slate-200"
              >
                {showExpenses ? <ChevronDown className="w-5 h-5 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 flex-shrink-0" />}
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
                <span>New Expenses ({newExpenses.length})</span>
              </button>
              <button
                onClick={() => {
                  // Assign all to default laundry (first laundry for expenses)
                  const defaultLaundry = allLaundries[0];
                  if (defaultLaundry) {
                    newExpenses.forEach(tx => {
                      if (!pendingChanges.has(tx.id) && !assigningItems.has(tx.id)) {
                        onAssignTransaction(tx.id, defaultLaundry.id);
                      }
                    });
                  }
                }}
                className="w-full sm:w-auto px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium whitespace-nowrap"
              >
                Process All → {allLaundries[0]?.name || 'Default'}
              </button>
            </div>
            {showExpenses && (
              <div className="space-y-2">
                {newExpenses.map(tx => {
                  const assigning = assigningItems.get(tx.id);
                  const isAnimating = assigning?.phase === 'animating';
                  const isFlyingOut = assigning?.phase === 'flyingOut';
                  const assignedLaundry = assigning ? allLaundries.find(l => l.id === assigning.agentId)?.name : null;

                  return (
                    <div
                      key={tx.id}
                      className={`bg-slate-800 rounded-lg p-3 sm:p-4 border transition-all duration-400 ease-out ${
                        isFlyingOut
                          ? 'opacity-0 translate-y-8 scale-95 max-h-0 py-0 my-0 overflow-hidden border-transparent'
                          : isAnimating
                          ? 'border-green-500/50 bg-green-900/20 opacity-80 scale-[0.98]'
                          : 'border-slate-700'
                      }`}
                      style={{
                        transition: isFlyingOut
                          ? 'all 400ms cubic-bezier(0.4, 0, 0.2, 1), max-height 400ms ease-out 100ms'
                          : 'all 300ms ease-out'
                      }}
                    >
                      {/* Desktop layout */}
                      <div className="hidden sm:flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-slate-400 text-sm">{formatDateShort(tx.transactionDate)}</span>
                            <span className="font-semibold text-red-400">-{formatMoney(tx.amount)}</span>
                          </div>
                          <p className="text-slate-300 text-sm truncate">{tx.description}</p>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isAnimating ? (
                            <div className="flex items-center gap-2 text-green-400">
                              <Check className="w-5 h-5" />
                              <span className="text-sm font-medium">→ {assignedLaundry}</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-slate-400 text-sm">Assign to</span>
                              {(() => {
                                // Check if this item is in 'selected' phase
                                const selectedByClick = assigning?.phase === 'selected' ? assigning.agentId : null;
                                const pending = pendingChanges.get(tx.id);
                                const selectedAgentId = selectedByClick || pending?.agentId;

                                return allLaundries.map((l, idx) => {
                                  // Default: first laundry for expenses
                                  const isSelected = selectedAgentId
                                    ? l.id === selectedAgentId
                                    : idx === 0;

                                  return (
                                    <button
                                      key={l.id}
                                      onClick={() => handleAssignExpense(tx.id, l.id)}
                                      disabled={!!assigning}
                                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                                        isSelected
                                          ? 'bg-purple-600 text-white'
                                          : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                      } ${assigning ? 'cursor-not-allowed' : ''}`}
                                    >
                                      {l.name}
                                    </button>
                                  );
                                });
                              })()}
                              <button
                                onClick={() => onIgnoreTransaction(tx.id)}
                                disabled={!!assigning}
                                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded disabled:cursor-not-allowed"
                                title="Ignore"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 text-xs">{formatDateShort(tx.transactionDate)}</span>
                          <span className="font-semibold text-red-400">-{formatMoney(tx.amount)}</span>
                        </div>
                        <p className="text-slate-300 text-sm line-clamp-2">{tx.description}</p>
                        {isAnimating ? (
                          <div className="flex items-center gap-2 text-green-400 justify-center py-1">
                            <Check className="w-5 h-5" />
                            <span className="text-sm font-medium">→ {assignedLaundry}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 pt-1">
                            {(() => {
                              const selectedByClick = assigning?.phase === 'selected' ? assigning.agentId : null;
                              const pending = pendingChanges.get(tx.id);
                              const selectedAgentId = selectedByClick || pending?.agentId;

                              return allLaundries.map((l, idx) => {
                                const isSelected = selectedAgentId
                                  ? l.id === selectedAgentId
                                  : idx === 0;

                                return (
                                  <button
                                    key={l.id}
                                    onClick={() => handleAssignExpense(tx.id, l.id)}
                                    disabled={!!assigning}
                                    className={`flex-1 px-2 py-2 rounded text-xs font-medium transition-colors ${
                                      isSelected
                                        ? 'bg-purple-600 text-white'
                                        : 'bg-slate-700 text-slate-200'
                                    } ${assigning ? 'cursor-not-allowed' : ''}`}
                                  >
                                    {l.name}
                                  </button>
                                );
                              });
                            })()}
                            <button
                              onClick={() => onIgnoreTransaction(tx.id)}
                              disabled={!!assigning}
                              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded disabled:cursor-not-allowed"
                              title="Ignore"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Assigned Transactions */}
        {assignedTransactions.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowAssigned(!showAssigned)}
              className="w-full text-left text-base sm:text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2 hover:text-slate-200"
            >
              {showAssigned ? <ChevronDown className="w-5 h-5 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 flex-shrink-0" />}
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
              <span>Assigned ({assignedTransactions.length})</span>
            </button>
            {showAssigned && (
              <div className="space-y-2">
                {assignedTransactions.map(tx => {
                  const laundryName = allLaundries.find(l => l.id === tx.assignedAgentId)?.name || tx.assignedAgentId;
                  const isStripe = tx.transactionType === 'stripe_credit';
                  const hasPending = pendingChanges.has(tx.id);

                  return (
                    <div
                      key={tx.id}
                      className={`rounded-lg p-3 border ${isStripe ? 'bg-blue-900/20 border-blue-500/30' : 'bg-slate-800/50 border-slate-700/50'} ${hasPending ? 'ring-1 ring-amber-500/50' : ''}`}
                    >
                      {/* Desktop layout */}
                      <div className="hidden sm:flex items-center gap-3">
                        <Check className={`w-4 h-4 flex-shrink-0 ${isStripe ? 'text-blue-400' : 'text-green-400'}`} />
                        <span className="text-slate-400 text-sm">{formatDateShort(tx.transactionDate)}</span>
                        <span className={isStripe ? 'text-green-400' : 'text-red-400'}>
                          {isStripe ? '+' : '-'}{formatMoney(tx.amount)}
                        </span>
                        {isStripe && <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">STRIPE</span>}
                        <span className="text-slate-500">→</span>
                        <span className="text-slate-300 text-sm">{laundryName}</span>
                        <span className="text-slate-500 text-sm truncate flex-1">{tx.description}</span>
                        {hasPending && !isCompleted && !isCancelled && (
                          <button
                            onClick={() => onUndoChange(tx.id)}
                            className="p-1 text-amber-400 hover:text-amber-300"
                            title="Undo"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Check className={`w-4 h-4 flex-shrink-0 ${isStripe ? 'text-blue-400' : 'text-green-400'}`} />
                            <span className="text-slate-400 text-xs">{formatDateShort(tx.transactionDate)}</span>
                            {isStripe && <span className="text-xs px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded">STRIPE</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${isStripe ? 'text-green-400' : 'text-red-400'}`}>
                              {isStripe ? '+' : '-'}{formatMoney(tx.amount)}
                            </span>
                            {hasPending && !isCompleted && !isCancelled && (
                              <button
                                onClick={() => onUndoChange(tx.id)}
                                className="p-1 text-amber-400 hover:text-amber-300"
                                title="Undo"
                              >
                                <Undo2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500">→</span>
                          <span className="text-slate-300">{laundryName}</span>
                        </div>
                        <p className="text-slate-500 text-xs line-clamp-1">{tx.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Ignored Transactions (collapsible, collapsed by default) */}
        {ignoredTransactions.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowIgnored(!showIgnored)}
              className="w-full text-left text-base sm:text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2 hover:text-slate-200"
            >
              {showIgnored ? <ChevronDown className="w-5 h-5 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 flex-shrink-0" />}
              <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0"></span>
              <span>Ignored ({ignoredTransactions.length})</span>
            </button>
            {showIgnored && (
              <div className="space-y-2">
                {ignoredTransactions.map(tx => {
                  const isOtherCredit = tx.transactionType === 'other_credit';
                  const hasPending = pendingChanges.has(tx.id);

                  return (
                    <div
                      key={tx.id}
                      className={`bg-slate-800/30 rounded-lg p-3 border border-slate-700/30 ${hasPending ? 'ring-1 ring-amber-500/50' : ''}`}
                    >
                      {/* Desktop layout */}
                      <div className="hidden sm:flex items-center gap-3">
                        <Ban className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="text-slate-500 text-sm">{formatDateShort(tx.transactionDate)}</span>
                        <span className={isOtherCredit ? 'text-green-400/50' : 'text-slate-400'}>
                          {isOtherCredit ? '+' : '-'}{formatMoney(tx.amount)}
                        </span>
                        {isOtherCredit && <span className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded">CREDIT</span>}
                        <span className="text-slate-500 text-sm truncate flex-1">{tx.description}</span>
                        {tx.reconciliationNotes && (
                          <span className="text-xs text-slate-500 italic truncate max-w-[150px]">{tx.reconciliationNotes}</span>
                        )}
                        {!isCompleted && !isCancelled && (
                          hasPending ? (
                            <button
                              onClick={() => onUndoChange(tx.id)}
                              className="p-1 text-amber-400 hover:text-amber-300"
                              title="Undo"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => onUnignoreTransaction(tx.id)}
                              className="text-xs text-slate-400 hover:text-slate-200 underline"
                            >
                              Restore
                            </button>
                          )
                        )}
                      </div>
                      {/* Mobile layout */}
                      <div className="sm:hidden space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Ban className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            <span className="text-slate-500 text-xs">{formatDateShort(tx.transactionDate)}</span>
                            {isOtherCredit && <span className="text-xs px-1 py-0.5 bg-slate-700 text-slate-400 rounded">CREDIT</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${isOtherCredit ? 'text-green-400/50' : 'text-slate-400'}`}>
                              {isOtherCredit ? '+' : '-'}{formatMoney(tx.amount)}
                            </span>
                            {!isCompleted && !isCancelled && (
                              hasPending ? (
                                <button
                                  onClick={() => onUndoChange(tx.id)}
                                  className="p-1 text-amber-400 hover:text-amber-300"
                                  title="Undo"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => onUnignoreTransaction(tx.id)}
                                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                                >
                                  Restore
                                </button>
                              )
                            )}
                          </div>
                        </div>
                        <p className="text-slate-500 text-xs line-clamp-1">{tx.description}</p>
                        {tx.reconciliationNotes && (
                          <p className="text-xs text-slate-500 italic line-clamp-1">{tx.reconciliationNotes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {!isCompleted && !isCancelled && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-8">
            {hasUnsavedChanges && (
              <button
                onClick={onApplyChanges}
                disabled={applying}
                className="w-full sm:flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                {applying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Applying...
                  </>
                ) : (
                  `Apply ${pendingChanges.size} Changes`
                )}
              </button>
            )}
            <button
              onClick={() => onCompleteImport()}
              disabled={!canComplete || loading || hasUnsavedChanges}
              className="w-full sm:flex-1 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-semibold disabled:cursor-not-allowed"
            >
              {canComplete && !hasUnsavedChanges ? 'Complete Import' : `${newTransactions.length} remaining`}
            </button>
            <button
              onClick={() => onCancelImport()}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium"
            >
              Cancel
            </button>
          </div>
        )}

        {(isCompleted || isCancelled) && (
          <div className="mt-8 p-4 bg-slate-800 rounded-lg border border-slate-700 text-center">
            <p className="text-slate-400">
              This import has been {isCompleted ? 'completed' : 'cancelled'}.
            </p>
            <button
              onClick={onClearActiveImport}
              className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium"
            >
              Back to Imports
            </button>
          </div>
        )}
      </div>
    );
  }

  // Main view - upload area and import history
  return (
    <div className="pb-24 px-4 py-6 max-w-full sm:max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Bank Import</h1>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {uploadWarnings.length > 0 && (
        <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg text-amber-400">
          <div className="font-medium mb-2">Parse Warnings:</div>
          <ul className="list-disc list-inside text-sm">
            {uploadWarnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {uploadWarnings.length > 5 && (
              <li>...and {uploadWarnings.length - 5} more</li>
            )}
          </ul>
          <button
            onClick={() => setUploadWarnings([])}
            className="mt-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-slate-600 hover:border-slate-500'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <>
            <Loader2 className="w-12 h-12 text-purple-400 mx-auto mb-4 animate-spin" />
            <h2 className="text-lg font-semibold text-slate-200 mb-2">
              Processing CSV...
            </h2>
            <p className="text-slate-400">
              Parsing transactions, please wait
            </p>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-200 mb-2">
              Upload CGD Bank Statement
            </h2>
            <p className="text-slate-400 mb-4">
              Drag and drop a CSV file here, or click to select
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium disabled:opacity-50"
            >
              Select File
            </button>
          </>
        )}
      </div>

      {/* Import History */}
      <div className="mt-8">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 text-slate-200 font-semibold mb-4"
        >
          {showHistory ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          Import History ({imports.length})
        </button>

        {showHistory && (
          <div className="space-y-3">
            {imports.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                No imports yet
              </div>
            ) : (
              imports.map(imp => (
                <div
                  key={imp.id}
                  className="bg-slate-800 rounded-lg p-3 sm:p-4 border border-slate-700"
                >
                  {/* Desktop layout */}
                  <div className="hidden sm:flex items-center gap-4">
                    <FileText className="w-8 h-8 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-200 truncate">{imp.fileName}</div>
                      <div className="text-sm text-slate-400">
                        {imp.totalTransactions} transactions • {formatMoney(imp.totalAmount)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatTimestamp(imp.importedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        imp.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        imp.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {imp.status}
                      </span>
                      <button
                        onClick={() => onLoadImport(imp.id)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-sm"
                      >
                        View
                      </button>
                      {imp.status !== 'completed' && (
                        <button
                          onClick={() => onDeleteImport(imp.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded"
                          title="Delete import"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Mobile layout */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex items-start gap-3">
                      <FileText className="w-6 h-6 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-200 text-sm truncate">{imp.fileName}</div>
                        <div className="text-xs text-slate-400">
                          {imp.totalTransactions} txns • {formatMoney(imp.totalAmount)}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        imp.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        imp.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {imp.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pl-9">
                      <div className="text-xs text-slate-500">
                        {formatTimestamp(imp.importedAt)}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onLoadImport(imp.id)}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs"
                        >
                          View
                        </button>
                        {imp.status !== 'completed' && (
                          <button
                            onClick={() => onDeleteImport(imp.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded"
                            title="Delete import"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
