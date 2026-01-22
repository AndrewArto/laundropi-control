/**
 * CSV Parser for Bank Statements
 * Supports flexible column detection for various European bank formats
 */

export type TransactionType = 'expense' | 'stripe_credit' | 'other_credit';

export interface ParsedTransaction {
  date: string;          // YYYY-MM-DD format
  description: string;
  amount: number;        // Always positive
  reference: string | null;
  transactionType: TransactionType;  // Type of transaction
}

export interface CSVParseResult {
  transactions: ParsedTransaction[];
  errors: string[];
  warnings: string[];
}

interface DetectedColumns {
  date: number;
  description: number;
  amount: number;       // Debit column (expenses)
  credit?: number;      // Credit column (income) - optional
  reference?: number;
}

/**
 * Normalize a header string for matching
 * Handles encoding issues by replacing common corrupted characters
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .replace(/\.+$/, '')  // Remove trailing dots
    .trim()
    // Handle common encoding issues (ISO-8859-1 read as UTF-8)
    .replace(/[ã\xe3\xc3\xa3]/gi, 'a')
    .replace(/[é\xe9\xc3\xa9]/gi, 'e')
    .replace(/[ê\xea\xc3\xaa]/gi, 'e')
    .replace(/[í\xed\xc3\xad]/gi, 'i')
    .replace(/[ó\xf3\xc3\xb3]/gi, 'o')
    .replace(/[ú\xfa\xc3\xba]/gi, 'u')
    .replace(/[ç\xe7\xc3\xa7]/gi, 'c')
    .replace(/[^\x00-\x7F]/g, '');  // Remove any remaining non-ASCII
}

/**
 * Detect column indices based on header names
 * Supports Portuguese, English, and common variations
 * CGD bank format uses: "Data mov.", "Descrição", "Débito", "Crédito"
 */
function detectColumns(headers: string[]): DetectedColumns | null {
  const normalized = headers.map(normalizeHeader);

  // Date patterns - CGD uses "Data mov." or "Data valor"
  const datePatterns = /^(data(\s+mov)?(\s+valor)?|date|dia|fecha|datum|transaction.*date)$/i;
  const dateIndex = normalized.findIndex(h => datePatterns.test(h));

  // Description patterns - CGD uses "Descrição" -> "descricao"
  const descPatterns = /^(descri[c]?[a]?o|description|conceito|concept|narrat|details?|memo|remarks?)$/i;
  const descIndex = normalized.findIndex(h => descPatterns.test(h));

  // Debit/Amount patterns (expenses) - CGD uses "Débito" -> "debito"
  const amountPatterns = /^(montante|amount|valor|quantia|d[e]?bito?|expense|movimento|value)$/i;
  const amountIndex = normalized.findIndex(h => amountPatterns.test(h));

  // Credit patterns (income) - CGD uses "Crédito" -> "credito"
  const creditPatterns = /^(cr[e]?dito?|credit|income|receita|entrada)$/i;
  const creditIndex = normalized.findIndex(h => creditPatterns.test(h));

  // Reference/ID patterns (optional)
  const refPatterns = /^(refer[e]?ncia|reference|id|transaction.*id|n[u]?mero|number)$/i;
  const refIndex = normalized.findIndex(h => refPatterns.test(h));

  if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) {
    return null; // Missing required columns
  }

  return {
    date: dateIndex,
    description: descIndex,
    amount: amountIndex,
    credit: creditIndex >= 0 ? creditIndex : undefined,
    reference: refIndex >= 0 ? refIndex : undefined,
  };
}

/**
 * Parse date string to YYYY-MM-DD format
 * Supports: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD.MM.YYYY
 */
function parseDate(dateStr: string): string | null {
  const trimmed = dateStr.trim();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY/MM/DD
  const yyyymmdd = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, '0');
    const day = yyyymmdd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Parse amount string to number
 * Handles European (1.234,56) and Anglo (1,234.56) formats
 */
function parseAmount(amountStr: string): number | null {
  let cleaned = amountStr.trim();

  // Remove currency symbols
  cleaned = cleaned.replace(/[€$£¥₹]/g, '');

  // Remove whitespace
  cleaned = cleaned.replace(/\s+/g, '');

  // Detect format based on last separator
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European format: 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Anglo format: 1,234.56
    cleaned = cleaned.replace(/,/g, '');
  }

  // Handle negative amounts (remove minus sign, we only want positive expenses)
  cleaned = cleaned.replace(/^-/, '');

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.abs(num);
}

/**
 * Find the header line index in a CSV that may have metadata lines at the top
 * CGD bank CSVs have account info, date range, etc. before the actual header
 */
function findHeaderLineIndex(lines: string[], separator: ',' | ';'): number {
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = parseCSVLine(lines[i], separator);
    const columns = detectColumns(cells);
    if (columns) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse CSV content into structured transactions
 */
export function parseCSV(csvContent: string): CSVParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // Split into lines
  const lines = csvContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length === 0) {
    errors.push('CSV file is empty');
    return { transactions, errors, warnings };
  }

  // Detect separator by checking multiple lines
  const separator = detectSeparator(lines);

  // Find the actual header line (skip metadata lines)
  const headerLineIndex = findHeaderLineIndex(lines, separator);
  if (headerLineIndex === -1) {
    // Try first line as fallback
    const headers = parseCSVLine(lines[0], separator);
    errors.push(`Could not detect required columns. Found headers: ${headers.join(', ')}`);
    errors.push('Expected columns: Date, Description, Amount');
    return { transactions, errors, warnings };
  }

  const headerLine = lines[headerLineIndex];
  const headers = parseCSVLine(headerLine, separator);

  // Detect columns
  const columns = detectColumns(headers);
  if (!columns) {
    errors.push(`Could not detect required columns. Found headers: ${headers.join(', ')}`);
    errors.push('Expected columns: Date, Description, Amount');
    return { transactions, errors, warnings };
  }

  // Parse data rows (starting after header)
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cells = parseCSVLine(lines[i], separator);

    const requiredColumns = [columns.date, columns.description, columns.amount];
    if (columns.credit !== undefined) requiredColumns.push(columns.credit);

    if (cells.length < Math.max(...requiredColumns) + 1) {
      warnings.push(`Line ${lineNum}: Insufficient columns, skipping`);
      continue;
    }

    // Parse date
    const dateStr = cells[columns.date];
    const date = parseDate(dateStr);
    if (!date) {
      warnings.push(`Line ${lineNum}: Invalid date format "${dateStr}", skipping`);
      continue;
    }

    // Parse description
    const description = cells[columns.description].trim();
    if (!description) {
      warnings.push(`Line ${lineNum}: Empty description, skipping`);
      continue;
    }

    // Parse debit amount (expense)
    const debitStr = cells[columns.amount];
    const debitAmount = parseAmount(debitStr);

    // Parse credit amount (income) if column exists
    let creditAmount: number | null = null;
    if (columns.credit !== undefined) {
      const creditStr = cells[columns.credit];
      creditAmount = parseAmount(creditStr);
    }

    // Determine transaction type and amount
    let amount: number;
    let transactionType: TransactionType;

    if (debitAmount && debitAmount > 0) {
      // This is an expense (debit)
      amount = debitAmount;
      transactionType = 'expense';
    } else if (creditAmount && creditAmount > 0) {
      // This is a credit (income)
      amount = creditAmount;
      // Check if it's a Stripe transaction
      const isStripe = /stripe/i.test(description);
      transactionType = isStripe ? 'stripe_credit' : 'other_credit';
    } else {
      // No valid amount in either column
      warnings.push(`Line ${lineNum}: No valid amount found, skipping`);
      continue;
    }

    // Parse reference (optional)
    const reference = columns.reference !== undefined ? cells[columns.reference]?.trim() || null : null;

    transactions.push({
      date,
      description,
      amount,
      reference,
      transactionType,
    });
  }

  if (transactions.length === 0 && errors.length === 0) {
    errors.push('No valid transactions found in CSV');
  }

  return { transactions, errors, warnings };
}

/**
 * Detect the separator used in a CSV line (semicolon for European, comma for Anglo)
 * Returns ';' if semicolons are found outside quotes, otherwise ','
 */
function detectSeparatorFromLine(line: string): ',' | ';' {
  let inQuotes = false;
  let semicolonCount = 0;
  let commaCount = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ';') semicolonCount++;
      if (char === ',') commaCount++;
    }
  }

  // European CSVs use semicolons as separators (with commas as decimal points)
  // If we find semicolons, prefer semicolon as separator
  return semicolonCount > 0 ? ';' : ',';
}

/**
 * Detect separator by checking multiple lines (first non-empty lines that have potential separators)
 */
function detectSeparator(lines: string[]): ',' | ';' {
  // Check first 10 non-empty lines for semicolons
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const sep = detectSeparatorFromLine(lines[i]);
    if (sep === ';') {
      return ';';
    }
  }
  return ',';
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string, separator: ',' | ';' = ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      // End of cell
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last cell
  cells.push(current.trim());

  return cells;
}
