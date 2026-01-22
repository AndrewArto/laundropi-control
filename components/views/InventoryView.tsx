import React, { useState } from 'react';
import { Minus, Plus, Edit2, History, AlertTriangle } from 'lucide-react';
import type { DetergentType, InventoryItem, InventoryAudit, Laundry } from '../../types';
import { formatTimestamp } from '../../utils/formatting';

interface InventoryViewProps {
  laundries: Laundry[];
  inventory: Map<string, Map<DetergentType, InventoryItem>>;
  lastChanges: Map<string, InventoryAudit | null>;
  onUpdateQuantity: (agentId: string, detergentType: DetergentType, newQuantity: number) => Promise<void>;
  onViewAudit: (agentId: string, detergentType: DetergentType) => Promise<void>;
  auditLog: InventoryAudit[];
  showingAuditFor: { agentId: string; detergentType: DetergentType } | null;
  onCloseAudit: () => void;
}

const DETERGENT_LABELS: Record<DetergentType, string> = {
  blue: 'Blue Detergent',
  green: 'Green Detergent',
  brown: 'Brown Detergent',
};

const DETERGENT_COLORS: Record<DetergentType, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  brown: 'bg-amber-700',
};

const LOW_STOCK_THRESHOLD = 5;

export const InventoryView: React.FC<InventoryViewProps> = ({
  laundries,
  inventory,
  lastChanges,
  onUpdateQuantity,
  onViewAudit,
  auditLog,
  showingAuditFor,
  onCloseAudit,
}) => {
  const [editingItem, setEditingItem] = useState<{ agentId: string; detergentType: DetergentType } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const handleDecrease = async (agentId: string, detergentType: DetergentType, currentQuantity: number) => {
    if (currentQuantity <= 0) return;
    const key = `${agentId}-${detergentType}`;
    setLoading(key);
    try {
      await onUpdateQuantity(agentId, detergentType, currentQuantity - 1);
    } finally {
      setLoading(null);
    }
  };

  const handleIncrease = async (agentId: string, detergentType: DetergentType, currentQuantity: number) => {
    const key = `${agentId}-${detergentType}`;
    setLoading(key);
    try {
      await onUpdateQuantity(agentId, detergentType, currentQuantity + 1);
    } finally {
      setLoading(null);
    }
  };

  const handleStartEdit = (agentId: string, detergentType: DetergentType, currentQuantity: number) => {
    setEditingItem({ agentId, detergentType });
    setEditValue(String(currentQuantity));
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const newQuantity = parseInt(editValue, 10);
    if (isNaN(newQuantity) || newQuantity < 0) {
      console.error('Invalid quantity:', editValue, newQuantity);
      return;
    }

    const key = `${editingItem.agentId}-${editingItem.detergentType}`;
    setLoading(key);
    try {
      await onUpdateQuantity(editingItem.agentId, editingItem.detergentType, newQuantity);
      setEditingItem(null);
      setEditValue('');
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setLoading(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditValue('');
  };

  const getInventoryItem = (agentId: string, detergentType: DetergentType): InventoryItem => {
    const agentInventory = inventory.get(agentId);
    return agentInventory?.get(detergentType) || {
      agentId,
      detergentType,
      quantity: 0,
      updatedAt: Date.now(),
      updatedBy: 'system',
    };
  };

  const getLastChange = (agentId: string, detergentType: DetergentType): InventoryAudit | null => {
    const key = `${agentId}-${detergentType}`;
    return lastChanges.get(key) || null;
  };

  return (
    <div className="pb-24 px-4 py-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Detergent Inventory</h1>

      {laundries.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          No laundromats configured
        </div>
      )}

      {laundries.map((laundry) => (
        <div key={laundry.id} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-semibold text-slate-200">{laundry.name}</h2>
            {!laundry.isOnline && (
              <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">Offline</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['blue', 'green', 'brown'] as DetergentType[]).map((detergentType) => {
              const item = getInventoryItem(laundry.id, detergentType);
              const lastChange = getLastChange(laundry.id, detergentType);
              const isLowStock = item.quantity < LOW_STOCK_THRESHOLD;
              const isEditing = editingItem?.agentId === laundry.id && editingItem?.detergentType === detergentType;
              const isLoading = loading === `${laundry.id}-${detergentType}`;

              return (
                <div
                  key={detergentType}
                  className={`bg-slate-800 rounded-lg p-4 border ${
                    isLowStock ? 'border-amber-500/50' : 'border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-4 h-4 rounded-full ${DETERGENT_COLORS[detergentType]}`}></div>
                    <h3 className="font-medium text-slate-200">{DETERGENT_LABELS[detergentType]}</h3>
                  </div>

                  {isLowStock && (
                    <div className="flex items-center gap-2 mb-3 text-amber-400 text-sm">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Low stock</span>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="mb-3">
                      <input
                        type="number"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-slate-100 focus:outline-none focus:border-purple-500"
                        autoFocus
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={isLoading}
                          className="flex-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm font-medium disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={isLoading}
                          className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-slate-100 mb-3">
                        {item.quantity} <span className="text-lg text-slate-400">cans</span>
                      </div>

                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => handleDecrease(laundry.id, detergentType, item.quantity)}
                          disabled={item.quantity === 0 || isLoading}
                          className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <Minus className="w-5 h-5" />
                          Use 1
                        </button>
                        <button
                          onClick={() => handleIncrease(laundry.id, detergentType, item.quantity)}
                          disabled={isLoading}
                          className="px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 text-white rounded-lg flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStartEdit(laundry.id, detergentType, item.quantity)}
                          disabled={isLoading}
                          className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Set amount
                        </button>
                        <button
                          onClick={() => onViewAudit(laundry.id, detergentType)}
                          disabled={isLoading}
                          className="flex-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <History className="w-3.5 h-3.5" />
                          History
                        </button>
                      </div>
                    </>
                  )}

                  {lastChange && !isEditing && (
                    <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
                      <div>
                        Last: {lastChange.changeAmount > 0 ? '+' : ''}
                        {lastChange.changeAmount} by {lastChange.user}
                      </div>
                      <div>{formatTimestamp(lastChange.createdAt)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Audit Log Modal */}
      {showingAuditFor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={onCloseAudit}>
          <div
            className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-700">
              <h2 className="text-xl font-semibold text-slate-100">
                Change History - {DETERGENT_LABELS[showingAuditFor.detergentType]}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {laundries.find((l) => l.id === showingAuditFor.agentId)?.name}
              </p>
            </div>

            <div className="overflow-y-auto max-h-[60vh] p-6">
              {auditLog.length === 0 ? (
                <div className="text-center py-8 text-slate-400">No history available</div>
              ) : (
                <div className="space-y-3">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="bg-slate-900 rounded p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-slate-300 font-medium">{entry.user}</span>
                          <span className="text-slate-500 text-sm ml-2">
                            {entry.oldQuantity} → {entry.newQuantity}
                          </span>
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            entry.changeAmount > 0 ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {entry.changeAmount > 0 ? '+' : ''}
                          {entry.changeAmount}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">{formatTimestamp(entry.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-700">
              <button
                onClick={onCloseAudit}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
