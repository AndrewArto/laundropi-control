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

export type CameraSourceType = 'rtsp' | 'pattern';

export interface CameraConfig {
  id: string;
  agentId: string;
  name: string;
  position: string;
  sourceType: CameraSourceType;
  rtspUrl?: string | null;
  enabled: boolean;
  hasCredentials?: boolean;
  previewUrl?: string;
}

export interface Laundry {
  id: string;
  name: string;
  relays: Relay[];
  isOnline: boolean;
  isMock: boolean;
  lastHeartbeat: number | null;
}

// Special agent ID for fixed costs (not tied to a specific laundromat)
export const GENERAL_AGENT_ID = 'General';

// Create a synthetic "Fix cost" laundry for finance/cost tracking
export const GENERAL_LAUNDRY: Laundry = {
  id: GENERAL_AGENT_ID,
  name: 'Fix cost',
  relays: [],
  isOnline: true,
  isMock: false,
  lastHeartbeat: null,
};

export type RelaySelection = { agentId: string; relayId: number };

export type DetergentType = 'blue' | 'green' | 'brown';

export interface InventoryItem {
  agentId: string;
  detergentType: DetergentType;
  quantity: number;
  updatedAt: number;
  updatedBy: string;
}

export interface InventoryAudit {
  id?: number;
  agentId: string;
  detergentType: DetergentType;
  oldQuantity: number;
  newQuantity: number;
  changeAmount: number;
  user: string;
  createdAt: number;
}

export interface ExpenditureImport {
  id: string;
  fileName: string;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  totalTransactions: number;
  totalAmount: number;
  status: 'uploaded' | 'reconciling' | 'completed' | 'cancelled';
  importedAt: number;
  importedBy: string;
  completedAt: number | null;
  notes: string | null;
}

export type ReconciliationStatus = 'new' | 'existing' | 'discrepancy' | 'ignored';
export type TransactionType = 'expense' | 'stripe_credit' | 'other_credit';

export interface ExpenditureTransaction {
  id: string;
  importId: string;
  transactionDate: string;
  description: string;
  amount: number;
  bankReference: string | null;
  category: string | null;
  transactionType: TransactionType;  // Type of transaction (expense, stripe_credit, other_credit)
  reconciliationStatus: ReconciliationStatus;
  matchedDeductionKey: string | null;
  assignedAgentId: string | null;
  reconciliationNotes: string | null;
  createdAt: number;
}

export interface ReconciliationMatch {
  transactionId: string;
  existingDeduction?: {
    agentId: string;
    entryDate: string;
    amount: number;
    comment: string;
    index: number;
  };
  similarity: number;
}

export interface ProfitLossData {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  byAgent: Record<string, {
    revenue: number;
    expenses: number;
    netProfitLoss: number;
    margin: number;
    expenseBreakdown: Array<{ description: string; amount: number; date: string }>;
  }>;
  combined: {
    totalRevenue: number;
    totalExpenses: number;
    netProfitLoss: number;
    overallMargin: number;
  };
}

export interface LaundryInventory {
  agentId: string;
  items: InventoryItem[];
}

export interface ExpenditureAudit {
  id?: number;
  importId: string;
  transactionId: string | null;
  action: string;
  details: string | null;
  user: string;
  createdAt: number;
}

// Machine status from camera-based detection
export type MachineType = 'washer' | 'dryer';
export type MachineStatus = 'idle' | 'running' | 'unknown';

export interface LaundryMachine {
  id: string;
  label: string;
  type: MachineType;
  status: MachineStatus;
  lastUpdated: number;
}

export interface LaundryMachineStatus {
  agentId: string;
  machines: LaundryMachine[];
  lastAnalyzed: number;
}
