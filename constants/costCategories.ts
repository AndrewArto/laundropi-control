export type CostGroup = 'variable' | 'fixed';

export interface CostCategory {
  id: string;
  label: string;
  group: CostGroup;
}

// Variable costs for laundry agents (brandoa1/brandoa2)
export const VARIABLE_COST_CATEGORIES: CostCategory[] = [
  { id: 'detergents', label: 'Detergents', group: 'variable' },
  { id: 'water', label: 'Water', group: 'variable' },
  { id: 'gas', label: 'Gas', group: 'variable' },
  { id: 'electricity', label: 'Electricity', group: 'variable' },
  { id: 'vendomat_materials', label: 'Vendomat materials', group: 'variable' },
];

// Fixed costs for General agent
export const FIXED_COST_CATEGORIES: CostCategory[] = [
  { id: 'rent_br1', label: 'Rent Br1', group: 'fixed' },
  { id: 'rent_br2', label: 'Rent Br2', group: 'fixed' },
  { id: 'accounting', label: 'Accounting', group: 'fixed' },
  { id: 'maintenance', label: 'Maintenance, materials and repair', group: 'fixed' },
  { id: 'cleaning', label: 'Cleaning', group: 'fixed' },
  { id: 'insurance', label: 'Insurance', group: 'fixed' },
  { id: 'telecom', label: 'Telephone and internet', group: 'fixed' },
  { id: 'admin', label: 'Other bureaucratic and administration', group: 'fixed' },
  { id: 'advertising', label: 'Advertising and Communication', group: 'fixed' },
  { id: 'taxes', label: 'Taxes', group: 'fixed' },
];

// All cost categories combined
export const ALL_COST_CATEGORIES: CostCategory[] = [
  ...VARIABLE_COST_CATEGORIES,
  ...FIXED_COST_CATEGORIES,
];

import { GENERAL_AGENT_ID } from '../types';

/**
 * Get appropriate cost categories for a specific agent
 * @param agentId - The agent ID (e.g., 'brandoa1', 'brandoa2', 'General')
 * @returns Array of cost categories appropriate for the agent
 */
export function getCategoriesForAgent(agentId: string): CostCategory[] {
  return agentId === GENERAL_AGENT_ID ? FIXED_COST_CATEGORIES : VARIABLE_COST_CATEGORIES;
}