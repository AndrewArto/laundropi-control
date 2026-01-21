import { useState, useCallback, useRef } from 'react';
import { CameraConfig } from '../types';
import { ApiService } from '../services/api';

export interface UseCamerasReturn {
  cameraConfigs: Record<string, CameraConfig[]>;
  cameraFrameSources: Record<string, string>;
  cameraPreviewErrors: Record<string, boolean>;
  cameraWarmup: Record<string, number>;
  cameraVisibility: Record<string, boolean>;
  cameraSaving: Record<string, boolean>;
  cameraToggleLoading: Record<string, boolean>;
  cameraSaveErrors: Record<string, string | null>;
  cameraRefreshTick: number;
  setCameraConfigs: React.Dispatch<React.SetStateAction<Record<string, CameraConfig[]>>>;
  setCameraFrameSources: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCameraPreviewErrors: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCameraWarmup: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCameraVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCameraSaving: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCameraToggleLoading: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCameraSaveErrors: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  setCameraRefreshTick: React.Dispatch<React.SetStateAction<number>>;
  handleCameraEnabledToggle: (agentId: string, camera: CameraConfig) => Promise<void>;
  handleCameraSave: (agentId: string, cameraId: string, updates: Partial<CameraConfig>) => Promise<void>;
  resetCameraState: () => void;
}

export function useCameras(): UseCamerasReturn {
  const [cameraConfigs, setCameraConfigs] = useState<Record<string, CameraConfig[]>>({});
  const [cameraFrameSources, setCameraFrameSources] = useState<Record<string, string>>({});
  const [cameraPreviewErrors, setCameraPreviewErrors] = useState<Record<string, boolean>>({});
  const [cameraWarmup, setCameraWarmup] = useState<Record<string, number>>({});
  const [cameraVisibility, setCameraVisibility] = useState<Record<string, boolean>>({});
  const [cameraSaving, setCameraSaving] = useState<Record<string, boolean>>({});
  const [cameraToggleLoading, setCameraToggleLoading] = useState<Record<string, boolean>>({});
  const [cameraSaveErrors, setCameraSaveErrors] = useState<Record<string, string | null>>({});
  const [cameraRefreshTick, setCameraRefreshTick] = useState(0);

  const handleCameraEnabledToggle = useCallback(async (agentId: string, camera: CameraConfig) => {
    const key = `${agentId}::${camera.id}`;
    const nextEnabled = !camera.enabled;

    setCameraToggleLoading(prev => ({ ...prev, [key]: true }));

    try {
      const result = await ApiService.updateCamera(agentId, camera.id, { enabled: nextEnabled });

      setCameraConfigs(prev => {
        const existing = prev[agentId] || [];
        const nextList = existing.map(c => c.id === camera.id ? { ...c, ...result.camera } : c);
        const hasChanges = JSON.stringify(existing) !== JSON.stringify(nextList);
        return hasChanges ? { ...prev, [agentId]: nextList } : prev;
      });

      if (nextEnabled) {
        setCameraWarmup(prev => ({ ...prev, [key]: Date.now() }));
      }
    } catch (err) {
      console.error('Camera toggle failed:', err);
      throw err;
    } finally {
      setCameraToggleLoading(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, []);

  const handleCameraSave = useCallback(async (agentId: string, cameraId: string, updates: Partial<CameraConfig>) => {
    const key = `${agentId}::${cameraId}`;

    setCameraSaving(prev => ({ ...prev, [key]: true }));
    setCameraSaveErrors(prev => ({ ...prev, [key]: null }));

    try {
      const result = await ApiService.updateCamera(agentId, cameraId, updates);

      setCameraConfigs(prev => {
        const existing = prev[agentId] || [];
        const nextList = existing.map(c => c.id === cameraId ? { ...c, ...result.camera } : c);
        return { ...prev, [agentId]: nextList };
      });
    } catch (err: any) {
      const errorMsg = err?.message || 'Failed to save camera';
      setCameraSaveErrors(prev => ({ ...prev, [key]: errorMsg }));
      throw err;
    } finally {
      setCameraSaving(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, []);

  const resetCameraState = useCallback(() => {
    setCameraRefreshTick(0);
    setCameraPreviewErrors({});
    setCameraWarmup({});
    setCameraFrameSources({});
    setCameraSaving({});
    setCameraToggleLoading({});
    setCameraSaveErrors({});
  }, []);

  return {
    cameraConfigs,
    cameraFrameSources,
    cameraPreviewErrors,
    cameraWarmup,
    cameraVisibility,
    cameraSaving,
    cameraToggleLoading,
    cameraSaveErrors,
    cameraRefreshTick,
    setCameraConfigs,
    setCameraFrameSources,
    setCameraPreviewErrors,
    setCameraWarmup,
    setCameraVisibility,
    setCameraSaving,
    setCameraToggleLoading,
    setCameraSaveErrors,
    setCameraRefreshTick,
    handleCameraEnabledToggle,
    handleCameraSave,
    resetCameraState,
  };
}
