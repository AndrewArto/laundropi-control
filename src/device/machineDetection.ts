/**
 * Machine status detection via camera frame analysis.
 *
 * This module analyzes camera frames to determine if laundry machines are
 * idle or running. It uses display brightness detection - running machines
 * have lit LED displays showing time remaining.
 *
 * Detection approach:
 * - Check the display panel area for brightness (green/blue LED indicators)
 * - Running machines have bright displays, idle machines have dark displays
 * - Uses single-frame analysis (no motion detection) for reliability
 */

import type { LaundryMachine, MachineStatus, MachineType } from '../../types';

// Machine region configuration for each laundry
// These define bounding boxes (as percentages) where machine DISPLAYS appear in camera frames
export interface MachineRegion {
  id: string;
  label: string;
  type: MachineType;
  camera: 'front' | 'back';
  // Display panel bounding box as percentage of frame (0-1)
  // This should target the LED display area, not the whole machine
  x: number;
  y: number;
  width: number;
  height: number;
}

// Configuration per laundry
export interface LaundryMachineConfig {
  agentId: string;
  machines: MachineRegion[];
  // Brightness threshold for this location (0-255)
  // Higher values = need brighter display to count as running
  brightnessThreshold?: number;
}

// Default configurations - targeting the DISPLAY PANEL areas
// Coordinates are calibrated based on actual camera positions
export const MACHINE_CONFIGS: LaundryMachineConfig[] = [
  {
    agentId: 'Brandoa1',
    brightnessThreshold: 60, // Calibrate based on lighting conditions
    machines: [
      // Front camera - washers (left side) - targeting display panels at top of machines
      // Washers are in a row, displays are small panels above the drum window
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', x: 0.04, y: 0.32, width: 0.06, height: 0.06 },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', x: 0.145, y: 0.32, width: 0.06, height: 0.06 },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', x: 0.25, y: 0.32, width: 0.06, height: 0.06 },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', x: 0.355, y: 0.32, width: 0.06, height: 0.06 },
      // Front camera - dryers (right side, stacked 2x2) - targeting display panels
      // Top row dryers
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'front', x: 0.72, y: 0.18, width: 0.05, height: 0.05 },
      { id: 'd7', label: 'Dryer 7', type: 'dryer', camera: 'front', x: 0.86, y: 0.18, width: 0.05, height: 0.05 },
      // Bottom row dryers
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'front', x: 0.72, y: 0.48, width: 0.05, height: 0.05 },
      { id: 'd8', label: 'Dryer 8', type: 'dryer', camera: 'front', x: 0.86, y: 0.48, width: 0.05, height: 0.05 },
    ],
  },
  {
    agentId: 'Brandoa2',
    brightnessThreshold: 60,
    machines: [
      // Front camera - 4 washers in a row (targeting display areas)
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', x: 0.07, y: 0.32, width: 0.06, height: 0.06 },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', x: 0.22, y: 0.32, width: 0.06, height: 0.06 },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', x: 0.37, y: 0.32, width: 0.06, height: 0.06 },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', x: 0.52, y: 0.32, width: 0.06, height: 0.06 },
      // Back camera - 6 dryers stacked (3 columns x 2 rows)
      // Top row (left to right)
      { id: 'd1', label: 'Dryer 1', type: 'dryer', camera: 'back', x: 0.32, y: 0.18, width: 0.05, height: 0.05 },
      { id: 'd3', label: 'Dryer 3', type: 'dryer', camera: 'back', x: 0.50, y: 0.18, width: 0.05, height: 0.05 },
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'back', x: 0.68, y: 0.18, width: 0.05, height: 0.05 },
      // Bottom row (left to right)
      { id: 'd2', label: 'Dryer 2', type: 'dryer', camera: 'back', x: 0.32, y: 0.48, width: 0.05, height: 0.05 },
      { id: 'd4', label: 'Dryer 4', type: 'dryer', camera: 'back', x: 0.50, y: 0.48, width: 0.05, height: 0.05 },
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'back', x: 0.68, y: 0.48, width: 0.05, height: 0.05 },
    ],
  },
];

/**
 * Calculate average brightness in a region.
 * Returns value 0-255 where higher = brighter.
 */
function calculateRegionBrightness(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number }
): number {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  let brightnessSum = 0;
  let pixelCount = 0;

  // Calculate average brightness in the region
  // RGB format (3 bytes per pixel)
  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < buffer.length) {
        const r = buffer[idx];
        const g = buffer[idx + 1];
        const b = buffer[idx + 2];
        // Use perceived brightness formula (human eye is more sensitive to green)
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        brightnessSum += brightness;
        pixelCount++;
      }
    }
  }

  return pixelCount > 0 ? brightnessSum / pixelCount : 0;
}

/**
 * Calculate the percentage of bright pixels in a region.
 * This helps detect lit displays even if overall brightness is low.
 */
function calculateBrightPixelRatio(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
  threshold: number = 100
): number {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  let brightPixels = 0;
  let totalPixels = 0;

  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < buffer.length) {
        const r = buffer[idx];
        const g = buffer[idx + 1];
        const b = buffer[idx + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        if (brightness > threshold) {
          brightPixels++;
        }
        totalPixels++;
      }
    }
  }

  return totalPixels > 0 ? brightPixels / totalPixels : 0;
}

/**
 * Determine machine status based on display brightness.
 * Running machines have lit LED displays.
 */
function statusFromBrightness(
  avgBrightness: number,
  brightPixelRatio: number,
  threshold: number
): MachineStatus {
  // A display is considered "on" if either:
  // 1. Average brightness exceeds threshold, OR
  // 2. More than 15% of pixels are bright (catches LED segments)
  if (avgBrightness > threshold || brightPixelRatio > 0.15) {
    return 'running';
  }
  return 'idle';
}

/**
 * Analyze a camera frame to detect machine statuses using display brightness.
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
  const threshold = config.brightnessThreshold ?? 60;
  const results: LaundryMachine[] = [];
  const now = Date.now();

  for (const machine of cameraMachines) {
    const avgBrightness = calculateRegionBrightness(
      frameBuffer,
      frameWidth,
      frameHeight,
      machine
    );

    const brightPixelRatio = calculateBrightPixelRatio(
      frameBuffer,
      frameWidth,
      frameHeight,
      machine,
      100 // Pixel brightness threshold
    );

    const status = statusFromBrightness(avgBrightness, brightPixelRatio, threshold);

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
 * Clear cached frame data (no longer needed with brightness detection,
 * but kept for API compatibility).
 */
export function clearFrameCache(agentId?: string): void {
  // No-op - brightness detection doesn't use frame caching
}
