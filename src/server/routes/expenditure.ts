import express = require('express');
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import {
  createExpenditureImport,
  createExpenditureTransaction,
  getExpenditureImport,
  getExpenditureImportByHash,
  listExpenditureImports,
  listExpenditureTransactionsByImport,
  updateExpenditureImport,
  updateExpenditureTransaction,
  getExpenditureTransaction,
  listIgnoredExpenditureTransactions,
  insertExpenditureAudit,
  listExpenditureAudit,
  deleteExpenditureImport,
  ExpenditureImportRow,
  ExpenditureTransactionRow,
  getRevenueEntry,
  upsertRevenueEntry,
  insertRevenueAudit,
  listRevenueEntriesBetween,
} from '../db';
import { parseCSV } from '../services/csv-parser';
import { getSession } from '../middleware/auth';

const router = express.Router();

/**
 * Compute SHA-256 hash of file content for duplicate detection
 */
function computeFileHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Check if a transaction matches any previously ignored transaction
 */
function matchesIgnoredTransaction(
  transaction: { transactionDate: string; description: string; amount: number; bankReference: string | null },
  ignoredList: ExpenditureTransactionRow[]
): boolean {
  for (const ignored of ignoredList) {
    // Match by bank reference if both have it
    if (transaction.bankReference && ignored.bankReference &&
        transaction.bankReference === ignored.bankReference) {
      return true;
    }
    // Match by date + description + amount
    if (transaction.transactionDate === ignored.transactionDate &&
        transaction.description === ignored.description &&
        Math.abs(transaction.amount - ignored.amount) < 0.01) {
      return true;
    }
  }
  return false;
}

/**
 * POST /api/expenditure/imports
 * Upload a CSV file
 */
router.post('/imports', express.text({ type: '*/*', limit: '5mb' }), (req, res) => {
  const session = getSession(req);
  const user = session?.sub || 'unknown';

  const csvContent = req.body;
  if (!csvContent || typeof csvContent !== 'string') {
    return res.status(400).json({ error: 'CSV content required' });
  }

  // Get filename from header or use default
  const fileName = req.headers['x-filename'] as string || `import-${Date.now()}.csv`;

  // Compute file hash for duplicate detection
  const fileHash = computeFileHash(csvContent);

  // Check for duplicate
  const existingImport = getExpenditureImportByHash(fileHash);
  if (existingImport) {
    return res.status(409).json({
      error: 'duplicate_file',
      message: `This file was already imported on ${new Date(existingImport.importedAt).toLocaleDateString()}`,
      existingImport,
    });
  }

  // Parse CSV
  const parseResult = parseCSV(csvContent);
  if (parseResult.errors.length > 0) {
    return res.status(400).json({
      error: 'parse_error',
      errors: parseResult.errors,
      warnings: parseResult.warnings,
    });
  }

  if (parseResult.transactions.length === 0) {
    return res.status(400).json({ error: 'No transactions found in CSV' });
  }

  // Get list of previously ignored transactions for auto-ignore
  const ignoredTransactions = listIgnoredExpenditureTransactions();

  // Calculate date range and total
  const dates = parseResult.transactions.map(t => t.date).sort();
  const totalAmount = parseResult.transactions.reduce((sum, t) => sum + t.amount, 0);

  // Create import record
  const importId = uuid();
  const now = Date.now();

  const importRow: ExpenditureImportRow = {
    id: importId,
    fileName,
    fileHash,
    dateRangeStart: dates[0] || null,
    dateRangeEnd: dates[dates.length - 1] || null,
    totalTransactions: parseResult.transactions.length,
    totalAmount,
    status: 'uploaded',
    importedAt: now,
    importedBy: user,
    completedAt: null,
    notes: null,
  };

  createExpenditureImport(importRow);

  // Create transaction records
  const transactions: ExpenditureTransactionRow[] = [];
  let autoIgnoredCount = 0;
  let otherCreditCount = 0;
  let stripeCreditCount = 0;

  for (const parsed of parseResult.transactions) {
    // Determine initial status based on transaction type
    let reconciliationStatus: ExpenditureTransactionRow['reconciliationStatus'] = 'new';
    let reconciliationNotes: string | null = null;

    if (parsed.transactionType === 'other_credit') {
      // Auto-ignore non-Stripe credits
      reconciliationStatus = 'ignored';
      reconciliationNotes = 'Auto-ignored (non-Stripe credit transaction)';
      otherCreditCount++;
    } else if (parsed.transactionType === 'expense') {
      // Check if this expense matches a previously ignored transaction
      const isAutoIgnored = matchesIgnoredTransaction(
        {
          transactionDate: parsed.date,
          description: parsed.description,
          amount: parsed.amount,
          bankReference: parsed.reference,
        },
        ignoredTransactions
      );

      if (isAutoIgnored) {
        reconciliationStatus = 'ignored';
        reconciliationNotes = 'Auto-ignored (matches previously ignored transaction)';
        autoIgnoredCount++;
      }
    } else if (parsed.transactionType === 'stripe_credit') {
      // Stripe credits need user assignment to a laundry
      reconciliationStatus = 'new';
      reconciliationNotes = 'Stripe payment - assign to laundry revenue';
      stripeCreditCount++;
    }

    const txRow: ExpenditureTransactionRow = {
      id: uuid(),
      importId,
      transactionDate: parsed.date,
      description: parsed.description,
      amount: parsed.amount,
      bankReference: parsed.reference,
      category: null,
      transactionType: parsed.transactionType,
      reconciliationStatus,
      matchedDeductionKey: null,
      assignedAgentId: null,
      reconciliationNotes,
      createdAt: now,
    };

    createExpenditureTransaction(txRow);
    transactions.push(txRow);
  }

  // Create audit entry
  insertExpenditureAudit({
    importId,
    transactionId: null,
    action: 'IMPORT_CREATED',
    details: JSON.stringify({
      fileName,
      totalTransactions: transactions.length,
      autoIgnored: autoIgnoredCount,
      otherCreditsIgnored: otherCreditCount,
      stripeCredits: stripeCreditCount,
    }),
    user,
    createdAt: now,
  });

  res.json({
    import: importRow,
    transactions,
    parseWarnings: parseResult.warnings,
    autoIgnoredCount,
    otherCreditsIgnored: otherCreditCount,
    stripeCredits: stripeCreditCount,
  });
});

/**
 * GET /api/expenditure/imports
 * List all imports
 */
router.get('/imports', (_req, res) => {
  const imports = listExpenditureImports();
  res.json({ imports });
});

/**
 * GET /api/expenditure/imports/:id
 * Get import details with transactions and summary
 */
router.get('/imports/:id', (req, res) => {
  const importRow = getExpenditureImport(req.params.id);
  if (!importRow) {
    return res.status(404).json({ error: 'Import not found' });
  }

  const transactions = listExpenditureTransactionsByImport(req.params.id);
  const audit = listExpenditureAudit(req.params.id);

  // Calculate summary
  const summary = {
    total: transactions.length,
    new: transactions.filter(t => t.reconciliationStatus === 'new').length,
    existing: transactions.filter(t => t.reconciliationStatus === 'existing').length,
    discrepancy: transactions.filter(t => t.reconciliationStatus === 'discrepancy').length,
    ignored: transactions.filter(t => t.reconciliationStatus === 'ignored').length,
    // By transaction type
    expenses: transactions.filter(t => t.transactionType === 'expense').length,
    stripeCredits: transactions.filter(t => t.transactionType === 'stripe_credit').length,
    otherCredits: transactions.filter(t => t.transactionType === 'other_credit').length,
    // Stripe credits pending assignment
    stripeCreditsPending: transactions.filter(t => t.transactionType === 'stripe_credit' && t.reconciliationStatus === 'new').length,
  };

  res.json({
    import: importRow,
    transactions,
    summary,
    audit,
  });
});

/**
 * DELETE /api/expenditure/imports/:id
 * Delete an import and all its transactions
 */
router.delete('/imports/:id', (req, res) => {
  const session = getSession(req);
  const user = session?.sub || 'unknown';

  const importRow = getExpenditureImport(req.params.id);
  if (!importRow) {
    return res.status(404).json({ error: 'Import not found' });
  }

  // Only allow deleting non-completed imports
  if (importRow.status === 'completed') {
    return res.status(400).json({ error: 'Cannot delete completed import' });
  }

  deleteExpenditureImport(req.params.id);

  res.json({ ok: true });
});

/**
 * PUT /api/expenditure/imports/:id
 * Update import status (complete or cancel)
 */
router.put('/imports/:id', (req, res) => {
  const session = getSession(req);
  const user = session?.sub || 'unknown';

  const importRow = getExpenditureImport(req.params.id);
  if (!importRow) {
    return res.status(404).json({ error: 'Import not found' });
  }

  const { status, notes } = req.body;
  if (!status || !['reconciling', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const completedAt = status === 'completed' ? Date.now() : importRow.completedAt;
  updateExpenditureImport(req.params.id, status, completedAt, notes || importRow.notes);

  // Create audit entry
  insertExpenditureAudit({
    importId: req.params.id,
    transactionId: null,
    action: status === 'completed' ? 'IMPORT_COMPLETED' : status === 'cancelled' ? 'IMPORT_CANCELLED' : 'IMPORT_STATUS_CHANGED',
    details: JSON.stringify({ status, notes }),
    user,
    createdAt: Date.now(),
  });

  const updated = getExpenditureImport(req.params.id);
  res.json({ import: updated });
});

/**
 * PUT /api/expenditure/transactions/:id
 * Update a transaction's reconciliation status
 */
router.put('/transactions/:id', (req, res) => {
  const session = getSession(req);
  const user = session?.sub || 'unknown';

  const transaction = getExpenditureTransaction(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const { reconciliationStatus, assignedAgentId, matchedDeductionKey, reconciliationNotes } = req.body;

  if (reconciliationStatus && !['new', 'existing', 'discrepancy', 'ignored'].includes(reconciliationStatus)) {
    return res.status(400).json({ error: 'Invalid reconciliation status' });
  }

  updateExpenditureTransaction(
    req.params.id,
    reconciliationStatus || transaction.reconciliationStatus,
    matchedDeductionKey !== undefined ? matchedDeductionKey : transaction.matchedDeductionKey,
    assignedAgentId !== undefined ? assignedAgentId : transaction.assignedAgentId,
    reconciliationNotes !== undefined ? reconciliationNotes : transaction.reconciliationNotes
  );

  // Create audit entry
  insertExpenditureAudit({
    importId: transaction.importId,
    transactionId: req.params.id,
    action: reconciliationStatus === 'ignored' ? 'TRANSACTION_IGNORED' : 'TRANSACTION_UPDATED',
    details: JSON.stringify({
      oldStatus: transaction.reconciliationStatus,
      newStatus: reconciliationStatus || transaction.reconciliationStatus,
      assignedAgentId,
    }),
    user,
    createdAt: Date.now(),
  });

  const updated = getExpenditureTransaction(req.params.id);
  res.json({ transaction: updated });
});

/**
 * POST /api/expenditure/transactions/:id/assign
 * Assign a transaction to a laundry by creating a deduction entry
 */
router.post('/transactions/:id/assign', (req, res) => {
  const session = getSession(req);
  const user = session?.sub || 'unknown';

  const transaction = getExpenditureTransaction(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  const { agentId, entryDate, comment } = req.body;
  if (!agentId) {
    return res.status(400).json({ error: 'agentId required' });
  }

  const targetDate = entryDate || transaction.transactionDate;
  const deductionComment = comment || transaction.description;
  const now = Date.now();

  // Get or create revenue entry for this agent/date
  let entry = getRevenueEntry(agentId, targetDate);
  const isNewEntry = !entry;

  if (!entry) {
    entry = {
      agentId,
      entryDate: targetDate,
      createdAt: now,
      updatedAt: now,
      coinsTotal: 0,
      euroCoinsCount: 0,
      billsTotal: 0,
      deductions: [],
      deductionsTotal: 0,
      createdBy: user,
      updatedBy: user,
      hasEdits: false,
    };
  }

  // Add new deduction
  const prevDeductions = [...entry.deductions];
  const newDeduction = { amount: transaction.amount, comment: deductionComment };
  entry.deductions.push(newDeduction);
  entry.deductionsTotal = entry.deductions.reduce((sum, d) => sum + d.amount, 0);
  entry.updatedAt = now;
  entry.updatedBy = user;
  entry.hasEdits = true;

  // Save revenue entry
  upsertRevenueEntry(entry);

  // Create revenue audit entry
  insertRevenueAudit([{
    agentId,
    entryDate: targetDate,
    field: 'deductions',
    oldValue: isNewEntry ? null : JSON.stringify(prevDeductions),
    newValue: JSON.stringify(entry.deductions),
    user,
    createdAt: now,
  }]);

  // Update transaction as assigned
  const deductionKey = `${agentId}:${targetDate}:${entry.deductions.length - 1}`;
  updateExpenditureTransaction(
    req.params.id,
    'existing',
    deductionKey,
    agentId,
    `Assigned to ${agentId} on ${targetDate}`
  );

  // Create expenditure audit entry
  insertExpenditureAudit({
    importId: transaction.importId,
    transactionId: req.params.id,
    action: 'TRANSACTION_ASSIGNED',
    details: JSON.stringify({
      agentId,
      entryDate: targetDate,
      amount: transaction.amount,
      comment: deductionComment,
      deductionKey,
    }),
    user,
    createdAt: now,
  });

  const updated = getExpenditureTransaction(req.params.id);
  res.json({
    transaction: updated,
    revenueEntry: entry,
    deductionKey,
  });
});

/**
 * POST /api/expenditure/transactions/:id/assign-stripe
 * Assign a Stripe credit transaction to a laundry's revenue
 * This adds the amount to the laundry's coinsTotal (main revenue field)
 */
router.post('/transactions/:id/assign-stripe', (req, res) => {
  const session = getSession(req);
  const user = session?.sub || 'unknown';

  const transaction = getExpenditureTransaction(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  if (transaction.transactionType !== 'stripe_credit') {
    return res.status(400).json({ error: 'Transaction is not a Stripe credit' });
  }

  const { agentId, entryDate } = req.body;
  if (!agentId) {
    return res.status(400).json({ error: 'agentId required' });
  }

  const targetDate = entryDate || transaction.transactionDate;
  const now = Date.now();

  // Get or create revenue entry for this agent/date
  let entry = getRevenueEntry(agentId, targetDate);
  const isNewEntry = !entry;
  const prevCoinsTotal = entry?.coinsTotal || 0;

  if (!entry) {
    entry = {
      agentId,
      entryDate: targetDate,
      createdAt: now,
      updatedAt: now,
      coinsTotal: 0,
      euroCoinsCount: 0,
      billsTotal: 0,
      deductions: [],
      deductionsTotal: 0,
      createdBy: user,
      updatedBy: user,
      hasEdits: false,
    };
  }

  // Add Stripe payment to coinsTotal (main revenue field)
  entry.coinsTotal += transaction.amount;
  entry.updatedAt = now;
  entry.updatedBy = user;
  entry.hasEdits = true;

  // Save revenue entry
  upsertRevenueEntry(entry);

  // Create revenue audit entry
  insertRevenueAudit([{
    agentId,
    entryDate: targetDate,
    field: 'coinsTotal',
    oldValue: isNewEntry ? null : String(prevCoinsTotal),
    newValue: String(entry.coinsTotal),
    user,
    createdAt: now,
  }]);

  // Update transaction as assigned
  updateExpenditureTransaction(
    req.params.id,
    'existing',
    `stripe:${agentId}:${targetDate}`,
    agentId,
    `Stripe payment assigned to ${agentId} revenue on ${targetDate}`
  );

  // Create expenditure audit entry
  insertExpenditureAudit({
    importId: transaction.importId,
    transactionId: req.params.id,
    action: 'STRIPE_CREDIT_ASSIGNED',
    details: JSON.stringify({
      agentId,
      entryDate: targetDate,
      amount: transaction.amount,
      previousCoinsTotal: prevCoinsTotal,
      newCoinsTotal: entry.coinsTotal,
    }),
    user,
    createdAt: now,
  });

  const updated = getExpenditureTransaction(req.params.id);
  res.json({
    transaction: updated,
    revenueEntry: entry,
  });
});

/**
 * GET /api/expenditure/deductions
 * Get all deductions in a date range for matching
 */
router.get('/deductions', (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate required' });
  }

  const entries = listRevenueEntriesBetween(startDate as string, endDate as string);

  // Flatten deductions with their keys
  const deductions: Array<{
    key: string;
    agentId: string;
    entryDate: string;
    amount: number;
    comment: string;
    index: number;
  }> = [];

  for (const entry of entries) {
    entry.deductions.forEach((d, index) => {
      deductions.push({
        key: `${entry.agentId}:${entry.entryDate}:${index}`,
        agentId: entry.agentId,
        entryDate: entry.entryDate,
        amount: d.amount,
        comment: d.comment,
        index,
      });
    });
  }

  res.json({ deductions });
});

export default router;
