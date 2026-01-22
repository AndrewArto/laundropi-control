import { useState, useCallback } from 'react';
import { Schedule } from '../types';
import { ApiService } from '../services/api';

export interface UseSchedulesReturn {
  schedules: Schedule[];
  setSchedules: React.Dispatch<React.SetStateAction<Schedule[]>>;
  addSchedule: (agentId: string, schedule: Omit<Schedule, 'id'>) => Promise<Schedule>;
  updateSchedule: (agentId: string, id: string, schedule: Omit<Schedule, 'id'>) => Promise<Schedule>;
  deleteSchedule: (agentId: string, id: string) => Promise<void>;
  removeRelayFromSchedules: (relayId: number) => void;
  resetSchedulesState: () => void;
}

export function useSchedules(): UseSchedulesReturn {
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  const addSchedule = useCallback(async (agentId: string, schedule: Omit<Schedule, 'id'>): Promise<Schedule> => {
    try {
      const created = await ApiService.addSchedule(agentId, schedule);

      setSchedules(prev => {
        const next = [...prev, created];
        const hasChanges = JSON.stringify(prev) !== JSON.stringify(next);
        return hasChanges ? next : prev;
      });

      return created;
    } catch (err) {
      console.error('Schedule add failed:', err);
      throw err;
    }
  }, []);

  const updateSchedule = useCallback(async (agentId: string, id: string, schedule: Omit<Schedule, 'id'>): Promise<Schedule> => {
    try {
      const updated = await ApiService.updateSchedule(agentId, id, schedule);

      setSchedules(prev => {
        const next = prev.map(s => s.id === id ? updated : s);
        const hasChanges = JSON.stringify(prev) !== JSON.stringify(next);
        return hasChanges ? next : prev;
      });

      return updated;
    } catch (err) {
      console.error('Schedule update failed:', err);
      throw err;
    }
  }, []);

  const deleteSchedule = useCallback(async (agentId: string, id: string): Promise<void> => {
    try {
      await ApiService.deleteSchedule(agentId, id);

      setSchedules(prev => {
        const next = prev.filter(s => s.id !== id);
        const hasChanges = JSON.stringify(prev) !== JSON.stringify(next);
        return hasChanges ? next : prev;
      });
    } catch (err) {
      console.error('Schedule delete failed:', err);
      throw err;
    }
  }, []);

  const removeRelayFromSchedules = useCallback((relayId: number) => {
    setSchedules(prev => prev.map(s => ({
      ...s,
      relayIds: s.relayIds.filter(rid => rid !== relayId)
    })));
  }, []);

  const resetSchedulesState = useCallback(() => {
    setSchedules([]);
  }, []);

  return {
    schedules,
    setSchedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    removeRelayFromSchedules,
    resetSchedulesState,
  };
}
