/**
 * Machine status detection via camera frame analysis.
 *
 * This module analyzes camera frames to determine if laundry machines are
 * idle or running. For Speed Queen machines with digital screens, we detect
 * if the screen is illuminated (running) vs dark (idle).
 *
 * Detection approach:
 * - Check the screen area for brightness
 * - Running machines have lit screens showing time/status
 * - Idle machines have dark/off screens
 * - Uses high brightness threshold to avoid false positives from ambient light
 */

import type { LaundryMachine, MachineStatus, MachineType } from '../../types';

// Machine region configuration for each laundry
// These define bounding boxes (as percentages) where machine SCREENS appear
export interface MachineRegion {
  id: string;
  label: string;
  type: MachineType;
  camera: 'front' | 'back';
  // Screen bounding box as percentage of frame (0-1)
  x: number;
  y: number;
  width: number;
  height: number;
}

// Configuration per laundry
export interface LaundryMachineConfig {
  agentId: string;
  machines: MachineRegion[];
  // Brightness threshold (0-255) - screens must be brighter than this
  brightnessThreshold?: number;
}

// Default configurations - targeting the SCREEN areas
// Speed Queen machines have small digital screens at the control panel
export const MACHINE_CONFIGS: LaundryMachineConfig[] = [
  {
    agentId: 'Brandoa1',
    brightnessThreshold: 180, // High threshold - only truly lit screens pass
    machines: [
      // Front camera - 4 washers (left side) - targeting screens at top of control panel
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', x: 0.04, y: 0.30, width: 0.05, height: 0.04 },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', x: 0.15, y: 0.30, width: 0.05, height: 0.04 },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', x: 0.26, y: 0.30, width: 0.05, height: 0.04 },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', x: 0.37, y: 0.30, width: 0.05, height: 0.04 },
      // Front camera - 4 dryers (right side, stacked 2x2) - targeting screens
      // Top row
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'front', x: 0.72, y: 0.15, width: 0.04, height: 0.04 },
      { id: 'd7', label: 'Dryer 7', type: 'dryer', camera: 'front', x: 0.86, y: 0.15, width: 0.04, height: 0.04 },
      // Bottom row
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'front', x: 0.72, y: 0.45, width: 0.04, height: 0.04 },
      { id: 'd8', label: 'Dryer 8', type: 'dryer', camera: 'front', x: 0.86, y: 0.45, width: 0.04, height: 0.04 },
    ],
  },
  {
    agentId: 'Brandoa2',
    brightnessThreshold: 180, // High threshold - only truly lit screens pass
    machines: [
      // Front camera - 4 washers in a row (targeting screens)
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', x: 0.08, y: 0.30, width: 0.05, height: 0.04 },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', x: 0.23, y: 0.30, width: 0.05, height: 0.04 },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', x: 0.38, y: 0.30, width: 0.05, height: 0.04 },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', x: 0.53, y: 0.30, width: 0.05, height: 0.04 },
      // Back camera - 6 dryers stacked (3 columns x 2 rows) - targeting screens
      // Top row (left to right)
      { id: 'd1', label: 'Dryer 1', type: 'dryer', camera: 'back', x: 0.32, y: 0.15, width: 0.04, height: 0.04 },
      { id: 'd3', label: 'Dryer 3', type: 'dryer', camera: 'back', x: 0.50, y: 0.15, width: 0.04, height: 0.04 },
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'back', x: 0.68, y: 0.15, width: 0.04, height: 0.04 },
      // Bottom row (left to right)
      { id: 'd2', label: 'Dryer 2', type: 'dryer', camera: 'back', x: 0.32, y: 0.45, width: 0.04, height: 0.04 },
      { id: 'd4', label: 'Dryer 4', type: 'dryer', camera: 'back', x: 0.50, y: 0.45, width: 0.04, height: 0.04 },
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'back', x: 0.68, y: 0.45, width: 0.04, height: 0.04 },
    ],
  },
];

/**
 * Calculate the maximum brightness pixel in a region.
 * This helps detect lit screens even if only part is bright.
 */
function calculateMaxBrightness(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number }
): number {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  let maxBrightness = 0;

  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < buffer.length) {
        const r = buffer[idx];
        const g = buffer[idx + 1];
        const b = buffer[idx + 2];
        const brightness = Math.max(r, g, b);
        if (brightness > maxBrightness) {
          maxBrightness = brightness;
        }
      }
    }
  }

  return maxBrightness;
}

/**
 * Calculate average brightness and the percentage of bright pixels.
 */
function analyzeRegionBrightness(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
  brightThreshold: number
): { avgBrightness: number; brightRatio: number; maxBrightness: number } {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  let brightnessSum = 0;
  let brightPixels = 0;
  let maxBrightness = 0;
  let pixelCount = 0;

  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < buffer.length) {
        const r = buffer[idx];
        const g = buffer[idx + 1];
        const b = buffer[idx + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        brightnessSum += brightness;
        pixelCount++;

        if (brightness > brightThreshold) {
          brightPixels++;
        }
        if (brightness > maxBrightness) {
          maxBrightness = brightness;
        }
      }
    }
  }

  return {
    avgBrightness: pixelCount > 0 ? brightnessSum / pixelCount : 0,
    brightRatio: pixelCount > 0 ? brightPixels / pixelCount : 0,
    maxBrightness,
  };
}

/**
 * Determine machine status based on screen brightness.
 * A screen is considered "on" if it has sufficient bright pixels.
 * Uses strict criteria to avoid false positives from ambient light.
 */
function statusFromScreenBrightness(
  avgBrightness: number,
  brightRatio: number,
  maxBrightness: number,
  threshold: number
): MachineStatus {
  // Screen is on if:
  // 1. More than 20% of pixels are above threshold (need significant screen illumination), AND
  // 2. Max brightness is very high (> 200) indicating active display
  // Both conditions must be met to avoid false positives
  if (brightRatio > 0.20 && maxBrightness > 200) {
    return 'running';
  }
  return 'idle';
}

/**
 * Analyze a camera frame to detect machine statuses using screen brightness.
 *
 * @param agentId - The laundry agent ID
 * @param cameraPosition - 'front' or 'back'
 * @param frameBuffer - Raw RGB frame data
 * @param frameWidth - Frame width in pixels
 * @param frameHeight - Frame height in pixels
 * @returns Array of machine statuses
 */
export function analyzeFrame(
  agentId: string,
  cameraPosition: 'front' | 'back',
  frameBuffer: Buffer,
  frameWidth: number,
  frameHeight: number
): LaundryMachine[] {
  const config = MACHINE_CONFIGS.find(c => c.agentId === agentId);
  if (!config) {
    return [];
  }

  const cameraMachines = config.machines.filter(m => m.camera === cameraPosition);
  const threshold = config.brightnessThreshold ?? 80;
  const results: LaundryMachine[] = [];
  const now = Date.now();

  for (const machine of cameraMachines) {
    const { avgBrightness, brightRatio, maxBrightness } = analyzeRegionBrightness(
      frameBuffer,
      frameWidth,
      frameHeight,
      machine,
      threshold
    );

    const status = statusFromScreenBrightness(avgBrightness, brightRatio, maxBrightness, threshold);

    results.push({
      id: machine.id,
      label: machine.label,
      type: machine.type,
      status,
      lastUpdated: now,
    });
  }

  return results;
}

/**
 * Get machine configuration for a laundry.
 */
export function getMachineConfig(agentId: string): LaundryMachineConfig | undefined {
  return MACHINE_CONFIGS.find(c => c.agentId === agentId);
}

/**
 * Clear cached frame data (not needed for brightness detection, kept for API).
 */
export function clearFrameCache(agentId?: string): void {
  // No-op for brightness detection
}
