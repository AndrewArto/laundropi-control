import { useState, useCallback } from 'react';
import type { DetergentType, InventoryItem, InventoryAudit } from '../types';
import { ApiService } from '../services/api';

export const useInventory = () => {
  const [inventory, setInventory] = useState<Map<string, Map<DetergentType, InventoryItem>>>(new Map());
  const [lastChanges, setLastChanges] = useState<Map<string, InventoryAudit | null>>(new Map());
  const [auditLog, setAuditLog] = useState<InventoryAudit[]>([]);
  const [showingAuditFor, setShowingAuditFor] = useState<{ agentId: string; detergentType: DetergentType } | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    try {
      const response = await ApiService.get<{ inventory: { agentId: string; items: InventoryItem[] }[] }>('/api/inventory');
      const newInventory = new Map<string, Map<DetergentType, InventoryItem>>();
      const newLastChanges = new Map<string, InventoryAudit | null>();

      for (const agentInventory of response.inventory) {
        const agentMap = new Map<DetergentType, InventoryItem>();
        for (const item of agentInventory.items) {
          agentMap.set(item.detergentType, item);

          // Fetch last change for each item
          try {
            const auditResponse = await ApiService.get<{ audit: InventoryAudit[] }>(
              `/api/inventory/${item.agentId}/${item.detergentType}/audit?limit=1`
            );
            const lastChange = auditResponse.audit[0] || null;
            newLastChanges.set(`${item.agentId}-${item.detergentType}`, lastChange);
          } catch (err) {
            console.error('Failed to fetch last change:', err);
          }
        }
        newInventory.set(agentInventory.agentId, agentMap);
      }

      setInventory(newInventory);
      setLastChanges(newLastChanges);
      setInventoryError(null);
    } catch (err) {
      console.error('Failed to fetch inventory:', err);
      setInventoryError('Failed to load inventory');
    }
  }, []);

  const updateQuantity = useCallback(
    async (agentId: string, detergentType: DetergentType, newQuantity: number) => {
      try {
        const response = await ApiService.post<{
          inventory: InventoryItem;
          lastChange: InventoryAudit;
        }>(`/api/inventory/${agentId}/${detergentType}`, { quantity: newQuantity });

        // Update local state
        setInventory((prev) => {
          const newMap = new Map(prev);
          const agentMap = newMap.get(agentId) || new Map<DetergentType, InventoryItem>();
          agentMap.set(detergentType, response.inventory);
          newMap.set(agentId, agentMap);
          return newMap;
        });

        setLastChanges((prev) => {
          const newMap = new Map(prev);
          newMap.set(`${agentId}-${detergentType}`, response.lastChange);
          return newMap;
        });

        setInventoryError(null);
      } catch (err) {
        console.error('Failed to update inventory:', err);
        setInventoryError('Failed to update inventory');
        throw err;
      }
    },
    []
  );

  const viewAudit = useCallback(
    async (agentId: string, detergentType: DetergentType) => {
      try {
        const response = await ApiService.get<{ audit: InventoryAudit[] }>(
          `/api/inventory/${agentId}/${detergentType}/audit`
        );
        setAuditLog(response.audit);
        setShowingAuditFor({ agentId, detergentType });
        setInventoryError(null);
      } catch (err) {
        console.error('Failed to fetch audit log:', err);
        setInventoryError('Failed to load audit log');
      }
    },
    []
  );

  const closeAudit = useCallback(() => {
    setShowingAuditFor(null);
    setAuditLog([]);
  }, []);

  return {
    inventory,
    lastChanges,
    auditLog,
    showingAuditFor,
    inventoryError,
    fetchInventory,
    updateQuantity,
    viewAudit,
    closeAudit,
  };
};
