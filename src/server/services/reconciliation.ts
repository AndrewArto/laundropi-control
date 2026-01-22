/**
 * Reconciliation Service
 * Handles matching bank transactions to existing revenue deductions
 */

import {
  ExpenditureTransactionRow,
  RevenueEntryRow,
  RevenueDeduction,
} from '../db';

export interface DeductionWithKey {
  key: string;
  agentId: string;
  entryDate: string;
  amount: number;
  comment: string;
  index: number;
}

export interface ReconciliationMatch {
  transactionId: string;
  deduction: DeductionWithKey;
  score: number;
  matchType: 'exact' | 'fuzzy';
}

export interface ReconciliationResult {
  matches: ReconciliationMatch[];
  unmatchedTransactions: ExpenditureTransactionRow[];
  unmatchedDeductions: DeductionWithKey[];
}

/**
 * Calculate date proximity score
 * Returns 0-1 where 1 is exact match
 */
function calculateDateScore(transactionDate: string, entryDate: string): number {
  const t = new Date(transactionDate);
  const e = new Date(entryDate);
  const diffDays = Math.abs((t.getTime() - e.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 1.0;
  if (diffDays <= 1) return 0.85;
  if (diffDays <= 2) return 0.7;
  if (diffDays <= 3) return 0.5;
  if (diffDays <= 7) return 0.3;
  return 0;
}

/**
 * Calculate amount similarity score
 * Returns 0-1 where 1 is exact match
 */
function calculateAmountScore(transactionAmount: number, deductionAmount: number): number {
  if (transactionAmount === deductionAmount) return 1.0;

  const diff = Math.abs(transactionAmount - deductionAmount);
  const maxAmount = Math.max(transactionAmount, deductionAmount);

  if (maxAmount === 0) return 0;

  const percentDiff = diff / maxAmount;

  if (percentDiff <= 0.001) return 0.99;  // ~0.1% tolerance (rounding)
  if (percentDiff <= 0.01) return 0.95;   // 1% tolerance
  if (percentDiff <= 0.05) return 0.8;    // 5% tolerance
  if (percentDiff <= 0.10) return 0.5;    // 10% tolerance
  return 0;
}

/**
 * Calculate description similarity using simple word matching
 */
function calculateDescriptionScore(description: string, comment: string): number {
  const normalizedDesc = description.toLowerCase().trim();
  const normalizedComment = comment.toLowerCase().trim();

  // Exact match
  if (normalizedDesc === normalizedComment) return 1.0;

  // Check if one contains the other
  if (normalizedDesc.includes(normalizedComment) || normalizedComment.includes(normalizedDesc)) {
    return 0.8;
  }

  // Word overlap
  const descWords = new Set(normalizedDesc.split(/\s+/).filter(w => w.length > 2));
  const commentWords = new Set(normalizedComment.split(/\s+/).filter(w => w.length > 2));

  if (descWords.size === 0 || commentWords.size === 0) return 0;

  let matchCount = 0;
  for (const word of descWords) {
    if (commentWords.has(word)) matchCount++;
  }

  return matchCount / Math.max(descWords.size, commentWords.size);
}

/**
 * Extract deductions from revenue entries with their keys
 */
export function extractDeductions(entries: RevenueEntryRow[]): DeductionWithKey[] {
  const deductions: DeductionWithKey[] = [];

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

  return deductions;
}

/**
 * Find matching deductions for a set of transactions
 */
export function findMatches(
  transactions: ExpenditureTransactionRow[],
  deductions: DeductionWithKey[],
  threshold: number = 0.7
): ReconciliationResult {
  const matches: ReconciliationMatch[] = [];
  const matchedTransactionIds = new Set<string>();
  const matchedDeductionKeys = new Set<string>();

  // Only consider 'new' transactions
  const newTransactions = transactions.filter(t => t.reconciliationStatus === 'new');

  // Score all possible matches
  const scoredMatches: Array<{
    transaction: ExpenditureTransactionRow;
    deduction: DeductionWithKey;
    score: number;
  }> = [];

  for (const transaction of newTransactions) {
    for (const deduction of deductions) {
      const dateScore = calculateDateScore(transaction.transactionDate, deduction.entryDate);
      if (dateScore === 0) continue; // Skip if dates are too far apart

      const amountScore = calculateAmountScore(transaction.amount, deduction.amount);
      if (amountScore === 0) continue; // Skip if amounts don't match at all

      const descScore = calculateDescriptionScore(transaction.description, deduction.comment);

      // Weighted score: date (30%), amount (50%), description (20%)
      const totalScore = (dateScore * 0.3) + (amountScore * 0.5) + (descScore * 0.2);

      if (totalScore >= threshold) {
        scoredMatches.push({ transaction, deduction, score: totalScore });
      }
    }
  }

  // Sort by score descending
  scoredMatches.sort((a, b) => b.score - a.score);

  // Greedily assign best matches (each transaction/deduction can only be matched once)
  for (const { transaction, deduction, score } of scoredMatches) {
    if (matchedTransactionIds.has(transaction.id)) continue;
    if (matchedDeductionKeys.has(deduction.key)) continue;

    matches.push({
      transactionId: transaction.id,
      deduction,
      score,
      matchType: score >= 0.95 ? 'exact' : 'fuzzy',
    });

    matchedTransactionIds.add(transaction.id);
    matchedDeductionKeys.add(deduction.key);
  }

  // Unmatched transactions (excluding already reconciled ones)
  const unmatchedTransactions = newTransactions.filter(t => !matchedTransactionIds.has(t.id));

  // Unmatched deductions
  const unmatchedDeductions = deductions.filter(d => !matchedDeductionKeys.has(d.key));

  return {
    matches,
    unmatchedTransactions,
    unmatchedDeductions,
  };
}
