import { useState, useCallback, useMemo } from 'react';
import type { ExpenditureImport, ExpenditureTransaction, ExpenditureAudit } from '../types';
import { ApiService } from '../services/api';

export interface ReconciliationSummary {
  total: number;
  new: number;
  existing: number;
  discrepancy: number;
  ignored: number;
}

// Pending change stored in memory until Apply
export interface PendingChange {
  transactionId: string;
  action: 'assign_expense' | 'assign_stripe' | 'ignore' | 'unignore';
  agentId?: string;
  entryDate?: string;
  comment?: string;
}

export const useReconciliation = () => {
  // List of all imports
  const [imports, setImports] = useState<ExpenditureImport[]>([]);

  // Currently active import for reconciliation
  const [activeImport, setActiveImport] = useState<ExpenditureImport | null>(null);
  const [transactions, setTransactions] = useState<ExpenditureTransaction[]>([]);
  const [audit, setAudit] = useState<ExpenditureAudit[]>([]);

  // Pending changes (in memory only, not committed to DB)
  const [pendingChanges, setPendingChanges] = useState<Map<string, PendingChange>>(new Map());

  // Loading and error states
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute effective transactions (original + pending changes overlay)
  const effectiveTransactions = useMemo(() => {
    return transactions.map(tx => {
      const change = pendingChanges.get(tx.id);
      if (!change) return tx;

      // Apply pending change to create effective view
      switch (change.action) {
        case 'assign_expense':
        case 'assign_stripe':
          return {
            ...tx,
            reconciliationStatus: 'existing' as const,
            assignedAgentId: change.agentId || null,
            reconciliationNotes: change.action === 'assign_stripe'
              ? `Stripe payment → ${change.agentId}`
              : `Expense → ${change.agentId}`,
          };
        case 'ignore':
          return {
            ...tx,
            reconciliationStatus: 'ignored' as const,
            reconciliationNotes: 'Manually ignored',
          };
        case 'unignore':
          return {
            ...tx,
            reconciliationStatus: 'new' as const,
            reconciliationNotes: null,
          };
        default:
          return tx;
      }
    });
  }, [transactions, pendingChanges]);

  // Compute summary from effective transactions
  const summary = useMemo((): ReconciliationSummary | null => {
    if (effectiveTransactions.length === 0) return null;
    return {
      total: effectiveTransactions.length,
      new: effectiveTransactions.filter(t => t.reconciliationStatus === 'new').length,
      existing: effectiveTransactions.filter(t => t.reconciliationStatus === 'existing').length,
      discrepancy: effectiveTransactions.filter(t => t.reconciliationStatus === 'discrepancy').length,
      ignored: effectiveTransactions.filter(t => t.reconciliationStatus === 'ignored').length,
    };
  }, [effectiveTransactions]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = pendingChanges.size > 0;

  /**
   * Fetch list of all imports
   */
  const fetchImports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ApiService.listExpenditureImports();
      setImports(response.imports);
    } catch (err: any) {
      console.error('Failed to fetch imports:', err);
      setError(err.message || 'Failed to load imports');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load a specific import with its transactions
   */
  const loadImport = useCallback(async (importId: string) => {
    setLoading(true);
    setError(null);
    setPendingChanges(new Map()); // Clear any pending changes
    try {
      const response = await ApiService.getExpenditureImport(importId);
      setActiveImport(response.import);
      setTransactions(response.transactions);
      setAudit(response.audit);
    } catch (err: any) {
      console.error('Failed to load import:', err);
      setError(err.message || 'Failed to load import');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Upload a new CSV file
   */
  const uploadCsv = useCallback(async (file: File): Promise<{
    success: boolean;
    importId?: string;
    error?: string;
    warnings?: string[];
    isDuplicate?: boolean;
  }> => {
    setUploading(true);
    setError(null);
    setPendingChanges(new Map()); // Clear any pending changes
    try {
      const content = await file.text();
      const response = await ApiService.uploadBankCsv(content, file.name);

      // Update imports list
      setImports(prev => [response.import, ...prev]);

      // Set as active import
      setActiveImport(response.import);
      setTransactions(response.transactions);
      setAudit([]);

      return {
        success: true,
        importId: response.import.id,
        warnings: response.parseWarnings,
      };
    } catch (err: any) {
      console.error('Failed to upload CSV:', err);

      // Handle duplicate file - load the existing import instead
      if (err.existingImport) {
        try {
          const existingId = err.existingImport.id;
          const response = await ApiService.getExpenditureImport(existingId);
          setActiveImport(response.import);
          setTransactions(response.transactions);
          setAudit(response.audit);
          setError(null);
          return {
            success: true,
            importId: existingId,
            isDuplicate: true,
            warnings: ['This file was previously imported. Loading existing import.'],
          };
        } catch (loadErr: any) {
          console.error('Failed to load existing import:', loadErr);
          const errorMsg = loadErr.message || 'Failed to load existing import';
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }
      }

      const errorMsg = err.message || 'Failed to upload file';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setUploading(false);
    }
  }, []);

  /**
   * Stage an expense assignment (local only, not committed to DB)
   */
  const assignTransaction = useCallback((
    transactionId: string,
    agentId: string,
    entryDate?: string,
    comment?: string
  ) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(transactionId, {
        transactionId,
        action: 'assign_expense',
        agentId,
        entryDate,
        comment,
      });
      return next;
    });
  }, []);

  /**
   * Stage a Stripe credit assignment (local only, not committed to DB)
   */
  const assignStripeCredit = useCallback((
    transactionId: string,
    agentId: string,
    entryDate?: string
  ) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(transactionId, {
        transactionId,
        action: 'assign_stripe',
        agentId,
        entryDate,
      });
      return next;
    });
  }, []);

  /**
   * Stage marking a transaction as ignored (local only)
   */
  const ignoreTransaction = useCallback((transactionId: string, notes?: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.set(transactionId, {
        transactionId,
        action: 'ignore',
        comment: notes,
      });
      return next;
    });
  }, []);

  /**
   * Stage un-ignoring a transaction (local only)
   */
  const unignoreTransaction = useCallback((transactionId: string) => {
    // Check if this was originally ignored or we're undoing a pending ignore
    const originalTx = transactions.find(t => t.id === transactionId);
    const pendingChange = pendingChanges.get(transactionId);

    setPendingChanges(prev => {
      const next = new Map(prev);

      if (pendingChange?.action === 'ignore') {
        // Just remove the pending ignore - restores to original state
        next.delete(transactionId);
      } else if (originalTx?.reconciliationStatus === 'ignored') {
        // Original was ignored, stage an unignore
        next.set(transactionId, {
          transactionId,
          action: 'unignore',
        });
      }

      return next;
    });
  }, [transactions, pendingChanges]);

  /**
   * Undo a pending change (restore to original state)
   */
  const undoChange = useCallback((transactionId: string) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      next.delete(transactionId);
      return next;
    });
  }, []);

  /**
   * Clear all pending changes
   */
  const clearPendingChanges = useCallback(() => {
    setPendingChanges(new Map());
  }, []);

  /**
   * Apply all pending changes to the database
   */
  const applyChanges = useCallback(async () => {
    if (!activeImport || pendingChanges.size === 0) return;

    setApplying(true);
    setError(null);

    try {
      // Process all pending changes
      const changes = Array.from(pendingChanges.values());

      for (const change of changes) {
        switch (change.action) {
          case 'assign_expense':
            await ApiService.assignExpenditureTransaction(
              change.transactionId,
              change.agentId!,
              change.entryDate,
              change.comment
            );
            break;
          case 'assign_stripe':
            await ApiService.assignStripeCredit(
              change.transactionId,
              change.agentId!,
              change.entryDate
            );
            break;
          case 'ignore':
            await ApiService.updateExpenditureTransaction(change.transactionId, {
              reconciliationStatus: 'ignored',
              reconciliationNotes: change.comment || 'Manually ignored',
            });
            break;
          case 'unignore':
            await ApiService.updateExpenditureTransaction(change.transactionId, {
              reconciliationStatus: 'new',
              reconciliationNotes: null,
            });
            break;
        }
      }

      // Reload the import to get fresh data from DB
      const response = await ApiService.getExpenditureImport(activeImport.id);
      setTransactions(response.transactions);
      setAudit(response.audit);

      // Clear pending changes
      setPendingChanges(new Map());

      return true;
    } catch (err: any) {
      console.error('Failed to apply changes:', err);
      setError(err.message || 'Failed to apply changes');
      throw err;
    } finally {
      setApplying(false);
    }
  }, [activeImport, pendingChanges]);

  /**
   * Complete the import reconciliation (marks import as completed)
   */
  const completeImport = useCallback(async (notes?: string) => {
    if (!activeImport) return;

    // First apply any pending changes
    if (pendingChanges.size > 0) {
      await applyChanges();
    }

    setLoading(true);
    setError(null);
    try {
      const response = await ApiService.updateExpenditureImport(activeImport.id, 'completed', notes);

      // Update in local state
      setActiveImport(response.import);
      setImports(prev => prev.map(i =>
        i.id === activeImport.id ? response.import : i
      ));

      return response.import;
    } catch (err: any) {
      console.error('Failed to complete import:', err);
      setError(err.message || 'Failed to complete import');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [activeImport, pendingChanges, applyChanges]);

  /**
   * Cancel the import
   */
  const cancelImport = useCallback(async (notes?: string) => {
    if (!activeImport) return;

    setError(null);
    try {
      const response = await ApiService.updateExpenditureImport(activeImport.id, 'cancelled', notes);

      // Update in local state
      setActiveImport(response.import);
      setImports(prev => prev.map(i =>
        i.id === activeImport.id ? response.import : i
      ));

      // Clear pending changes
      setPendingChanges(new Map());

      return response.import;
    } catch (err: any) {
      console.error('Failed to cancel import:', err);
      setError(err.message || 'Failed to cancel import');
      throw err;
    }
  }, [activeImport]);

  /**
   * Delete an import
   */
  const deleteImport = useCallback(async (importId: string) => {
    setError(null);
    try {
      await ApiService.deleteExpenditureImport(importId);

      // Remove from local state
      setImports(prev => prev.filter(i => i.id !== importId));

      // Clear active if it was the deleted one
      if (activeImport?.id === importId) {
        setActiveImport(null);
        setTransactions([]);
        setAudit([]);
        setPendingChanges(new Map());
      }
    } catch (err: any) {
      console.error('Failed to delete import:', err);
      setError(err.message || 'Failed to delete import');
      throw err;
    }
  }, [activeImport]);

  /**
   * Clear the active import (go back to list)
   */
  const clearActiveImport = useCallback(() => {
    setActiveImport(null);
    setTransactions([]);
    setAudit([]);
    setPendingChanges(new Map());
    setError(null);
  }, []);

  return {
    // State
    imports,
    activeImport,
    transactions: effectiveTransactions, // Return effective (with pending changes applied)
    originalTransactions: transactions,   // Original from DB
    summary,
    audit,
    loading,
    uploading,
    applying,
    error,
    pendingChanges,
    hasUnsavedChanges,

    // Actions
    fetchImports,
    loadImport,
    uploadCsv,
    assignTransaction,
    assignStripeCredit,
    ignoreTransaction,
    unignoreTransaction,
    undoChange,
    clearPendingChanges,
    applyChanges,
    completeImport,
    cancelImport,
    deleteImport,
    clearActiveImport,
  };
};
