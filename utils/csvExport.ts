import { RevenueEntry } from '../types';
import { formatMoney } from './formatting';

const csvEscape = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const formatCsvTimestamp = (ts: number | null) => (ts ? new Date(ts).toISOString() : '');

export const exportRevenueToCsv = (
  entries: RevenueEntry[],
  laundryNameMap: Map<string, string>
) => {
  if (!entries.length) return;

  const header = [
    'entryDate',
    'laundry',
    'coinsTotal',
    'euroCoinsCount',
    'billsTotal',
    'deductionsTotal',
    'deductions',
    'updatedBy',
    'updatedAt',
    'createdBy',
    'createdAt',
  ];

  const rows = entries.map(entry => {
    const deductions = (entry.deductions || [])
      .map(item => `${formatMoney(item.amount)}:${item.comment}`)
      .join(' | ');
    return [
      entry.entryDate,
      laundryNameMap.get(entry.agentId) || entry.agentId,
      formatMoney(entry.coinsTotal),
      entry.euroCoinsCount,
      formatMoney(entry.billsTotal),
      formatMoney(entry.deductionsTotal),
      deductions,
      entry.updatedBy || '',
      formatCsvTimestamp(entry.updatedAt),
      entry.createdBy || '',
      formatCsvTimestamp(entry.createdAt),
    ];
  });

  const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `revenue-entries-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
