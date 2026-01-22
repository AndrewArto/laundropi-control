/**
 * CSV Parser for Bank Statements
 * Supports flexible column detection for various European bank formats
 */

export interface ParsedTransaction {
  date: string;          // YYYY-MM-DD format
  description: string;
  amount: number;        // Always positive for expenses
  reference: string | null;
}

export interface CSVParseResult {
  transactions: ParsedTransaction[];
  errors: string[];
  warnings: string[];
}

interface DetectedColumns {
  date: number;
  description: number;
  amount: number;
  reference?: number;
}

/**
 * Detect column indices based on header names
 * Supports Portuguese, English, and common variations
 */
function detectColumns(headers: string[]): DetectedColumns | null {
  const normalized = headers.map(h => h.toLowerCase().trim());

  // Date patterns
  const datePatterns = /^(data|date|día|fecha|datum|валюта|transaction.*date)$/i;
  const dateIndex = normalized.findIndex(h => datePatterns.test(h));

  // Description patterns
  const descPatterns = /^(descri[çc][aã]o|description|conceito|concept|narrat|details?|memo|remarks?)$/i;
  const descIndex = normalized.findIndex(h => descPatterns.test(h));

  // Amount patterns (debit, expense, valor)
  const amountPatterns = /^(montante|amount|valor|quantia|d[ée]bit|expense|movimento|value)$/i;
  const amountIndex = normalized.findIndex(h => amountPatterns.test(h));

  // Reference/ID patterns (optional)
  const refPatterns = /^(refer[êe]ncia|reference|id|transaction.*id|n[úu]mero|number)$/i;
  const refIndex = normalized.findIndex(h => refPatterns.test(h));

  if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) {
    return null; // Missing required columns
  }

  return {
    date: dateIndex,
    description: descIndex,
    amount: amountIndex,
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

  // Parse header (first line)
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Detect columns
  const columns = detectColumns(headers);
  if (!columns) {
    errors.push(`Could not detect required columns. Found headers: ${headers.join(', ')}`);
    errors.push('Expected columns: Date, Description, Amount');
    return { transactions, errors, warnings };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const cells = parseCSVLine(lines[i]);

    if (cells.length < Math.max(columns.date, columns.description, columns.amount) + 1) {
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

    // Parse amount
    const amountStr = cells[columns.amount];
    const amount = parseAmount(amountStr);
    if (amount === null || amount === 0) {
      warnings.push(`Line ${lineNum}: Invalid or zero amount "${amountStr}", skipping`);
      continue;
    }

    // Parse reference (optional)
    const reference = columns.reference !== undefined ? cells[columns.reference]?.trim() || null : null;

    transactions.push({
      date,
      description,
      amount,
      reference,
    });
  }

  if (transactions.length === 0 && errors.length === 0) {
    errors.push('No valid transactions found in CSV');
  }

  return { transactions, errors, warnings };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
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
    } else if (char === ',' && !inQuotes) {
      // End of cell
      cells.push(current.trim());
      current = '';
    } else if (char === ';' && !inQuotes) {
      // Semicolon separator (common in European CSVs)
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
