import type { CameraConfig } from '../types';

export const cameraDraftKey = (agentId: string, cameraId: string) => `${agentId}::${cameraId}`;

export const cameraPositionOrder = (position: string) =>
  position === 'front' ? 0 : position === 'back' ? 1 : 9;

export const buildCameraPreviewUrl = (
  camera: CameraConfig,
  agentId: string,
  cameraPreviewBase: string,
  cameraRefreshTick: number,
  options?: { cacheBust?: boolean }
) => {
  const raw = camera.previewUrl || `/api/agents/${encodeURIComponent(agentId)}/cameras/${encodeURIComponent(camera.id)}/frame`;
  const absolute = cameraPreviewBase && !/^https?:\/\//i.test(raw)
    ? `${cameraPreviewBase}${raw.startsWith('/') ? '' : '/'}${raw}`
    : raw;
  if (options?.cacheBust === false) return absolute;
  const sep = absolute.includes('?') ? '&' : '?';
  return `${absolute}${sep}t=${cameraRefreshTick}`;
};

export const getCameraSlots = (
  agentId: string,
  cameraConfigs: Record<string, CameraConfig[]>
): CameraConfig[] => {
  const existing = cameraConfigs[agentId] || [];
  const byPosition = new Map(existing.map(cam => [cam.position, cam]));
  const defaults = [
    { position: 'front', name: 'Front' },
    { position: 'back', name: 'Back' },
  ];
  const slots = defaults.map(def => {
    const cam = byPosition.get(def.position);
    if (cam) return cam;
    const id = `${agentId}:${def.position}`;
    return {
      id,
      agentId,
      name: def.name,
      position: def.position,
      sourceType: 'pattern' as const,
      enabled: false,
      previewUrl: `/api/agents/${encodeURIComponent(agentId)}/cameras/${encodeURIComponent(id)}/frame`,
    };
  });
  return slots.sort((a, b) => cameraPositionOrder(a.position) - cameraPositionOrder(b.position));
};

export const createCameraCardRegistry = () => {
  const cameraCardRefs = new Map<string, HTMLDivElement>();
  const cameraRefCallbacks = new Map<string, (node: HTMLDivElement | null) => void>();

  const registerCameraCard = (
    key: string,
    node: HTMLDivElement | null,
    observer: IntersectionObserver | null,
    setCameraVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  ) => {
    const existing = cameraCardRefs.get(key);
    if (existing && observer) observer.unobserve(existing);
    if (!node) {
      cameraCardRefs.delete(key);
      setCameraVisibility((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    node.dataset.cameraKey = key;
    cameraCardRefs.set(key, node);
    if (observer) observer.observe(node);
  };

  const getCameraCardRef = (
    key: string,
    registerCallback: (key: string, node: HTMLDivElement | null) => void
  ) => {
    const cached = cameraRefCallbacks.get(key);
    if (cached) return cached;
    const cb = (node: HTMLDivElement | null) => registerCallback(key, node);
    cameraRefCallbacks.set(key, cb);
    return cb;
  };

  return {
    cameraCardRefs,
    cameraRefCallbacks,
    registerCameraCard,
    getCameraCardRef,
  };
};
