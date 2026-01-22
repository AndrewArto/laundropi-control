export const formatMoney = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
};

export const makeDeductionId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const formatTimestamp = (ts: number) => new Date(ts).toLocaleString();

export const formatLastLogin = (ts: number | null) => (ts ? formatTimestamp(ts) : 'Never');

export const isRevenueNumericInput = (value: string) => /^(\d+([.,]\d*)?|[.,]\d*)?$/.test(value);

export const normalizeDecimalInput = (value: string) => value.replace(',', '.');
