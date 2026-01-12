export enum RelayType {
  LIGHT = 'LIGHT',
  DOOR = 'DOOR',
  SIGN = 'SIGN',
  MACHINE = 'MACHINE',
  OTHER = 'OTHER'
}

export interface Relay {
  id: number;
  name: string;
  gpioPin: number;
  type: RelayType;
  isOn: boolean;
  isLocked?: boolean; // If true, cannot be manually toggled
  channelNumber?: number; // Physical channel label on the relay board
  isHidden?: boolean; // Hidden from dashboard when not editing
  iconType?: RelayType; // Which icon to render
  colorGroup?: 'blue' | 'green' | 'orange' | 'pink' | null;
}

export interface Schedule {
  id: string;
  relayIds: number[];
  time: string; // HH:mm format (24h)
  action: 'ON' | 'OFF';
  days: string[]; // ['Mon', 'Tue', ...]
  active: boolean;
}

export interface RelayGroupEntry {
  agentId: string;
  relayIds: number[];
}

export interface RelayGroup {
  id: string;
  name: string;
  // entries are grouped by agent so a single group can span multiple laundries
  entries: RelayGroupEntry[];
  // relayIds is kept for backward-compatibility with older payloads
  relayIds?: number[];
  onTime?: string | null;
  offTime?: string | null;
  days: string[];
  active: boolean;
}

export interface UiUser {
  username: string;
  role: 'admin' | 'user';
  lastLoginAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RevenueDeduction {
  amount: number;
  comment: string;
}

export interface RevenueEntry {
  agentId: string;
  entryDate: string;
  createdAt: number;
  updatedAt: number;
  coinsTotal: number;
  euroCoinsCount: number;
  billsTotal: number;
  deductions: RevenueDeduction[];
  deductionsTotal: number;
  createdBy: string | null;
  updatedBy: string | null;
  hasEdits: boolean;
}

export interface RevenueAuditEntry {
  id?: number;
  agentId: string;
  entryDate: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  user: string;
  createdAt: number;
}

export interface RevenueSummary {
  startDate: string;
  endDate: string;
  totalsByAgent: Record<string, number>;
  overall: number;
  profitLossByAgent: Record<string, number>;
  profitLossOverall: number;
}
