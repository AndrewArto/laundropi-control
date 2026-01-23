/**
 * Machine status detection via camera frame analysis.
 *
 * This module analyzes camera frames to determine if laundry machines are
 * idle or running. It uses simple image processing techniques that work
 * well on Raspberry Pi without requiring GPU acceleration.
 *
 * Detection approach:
 * - For washers: Check if the drum window shows motion/blur (running) vs static clothes/empty (idle)
 * - For dryers: Check if display panel is lit and drum contents are moving
 *
 * Since we don't have GPU/ML inference, we use frame differencing between consecutive
 * captures to detect motion in the machine drum areas.
 */

import type { LaundryMachine, MachineStatus, MachineType } from '../../types';

// Machine region configuration for each laundry
// These define bounding boxes (as percentages) where machines appear in camera frames
export interface MachineRegion {
  id: string;
  label: string;
  type: MachineType;
  camera: 'front' | 'back';
  // Bounding box as percentage of frame (0-1)
  x: number;
  y: number;
  width: number;
  height: number;
}

// Configuration per laundry
export interface LaundryMachineConfig {
  agentId: string;
  machines: MachineRegion[];
}

// Default configurations - these should be calibrated per location
export const MACHINE_CONFIGS: LaundryMachineConfig[] = [
  {
    agentId: 'Brandoa1',
    machines: [
      // Front camera - left side washers
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', x: 0.02, y: 0.35, width: 0.12, height: 0.35 },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', x: 0.15, y: 0.35, width: 0.12, height: 0.35 },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', x: 0.28, y: 0.35, width: 0.12, height: 0.35 },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', x: 0.41, y: 0.35, width: 0.12, height: 0.35 },
      // Front camera - right side dryers (stacked)
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'front', x: 0.70, y: 0.15, width: 0.14, height: 0.25 },
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'front', x: 0.70, y: 0.45, width: 0.14, height: 0.25 },
      { id: 'd7', label: 'Dryer 7', type: 'dryer', camera: 'front', x: 0.85, y: 0.15, width: 0.14, height: 0.25 },
      { id: 'd8', label: 'Dryer 8', type: 'dryer', camera: 'front', x: 0.85, y: 0.45, width: 0.14, height: 0.25 },
    ],
  },
  {
    agentId: 'Brandoa2',
    machines: [
      // Front camera - washers
      { id: 'w10', label: 'Washer 10', type: 'washer', camera: 'front', x: 0.05, y: 0.35, width: 0.12, height: 0.35 },
      { id: 'w9', label: 'Washer 9', type: 'washer', camera: 'front', x: 0.20, y: 0.35, width: 0.12, height: 0.35 },
      { id: 'w8', label: 'Washer 8', type: 'washer', camera: 'front', x: 0.35, y: 0.35, width: 0.12, height: 0.35 },
      { id: 'w7', label: 'Washer 7', type: 'washer', camera: 'front', x: 0.50, y: 0.35, width: 0.12, height: 0.35 },
      // Back camera - more washers and dryers
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'back', x: 0.35, y: 0.40, width: 0.12, height: 0.30 },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'back', x: 0.48, y: 0.40, width: 0.12, height: 0.30 },
      // Back camera - dryers (stacked on right)
      { id: 'd1', label: 'Dryer 1', type: 'dryer', camera: 'back', x: 0.72, y: 0.15, width: 0.12, height: 0.22 },
      { id: 'd2', label: 'Dryer 2', type: 'dryer', camera: 'back', x: 0.72, y: 0.40, width: 0.12, height: 0.22 },
      { id: 'd3', label: 'Dryer 3', type: 'dryer', camera: 'back', x: 0.85, y: 0.15, width: 0.12, height: 0.22 },
      { id: 'd4', label: 'Dryer 4', type: 'dryer', camera: 'back', x: 0.85, y: 0.40, width: 0.12, height: 0.22 },
    ],
  },
];

// Store previous frame data for motion detection
const previousFrameData: Map<string, Buffer> = new Map();

/**
 * Calculate motion score between two frame buffers for a specific region.
 * Uses simple pixel difference sum - higher score = more motion.
 */
function calculateMotionScore(
  prev: Buffer,
  curr: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number }
): number {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  let diffSum = 0;
  let pixelCount = 0;

  // Compare grayscale values in the region
  // Assuming RGB format (3 bytes per pixel)
  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < prev.length && idx + 2 < curr.length) {
        // Calculate grayscale for both frames
        const prevGray = (prev[idx] + prev[idx + 1] + prev[idx + 2]) / 3;
        const currGray = (curr[idx] + curr[idx + 1] + curr[idx + 2]) / 3;
        diffSum += Math.abs(prevGray - currGray);
        pixelCount++;
      }
    }
  }

  return pixelCount > 0 ? diffSum / pixelCount : 0;
}

/**
 * Determine machine status based on motion score.
 * Threshold values may need calibration based on actual camera feeds.
 */
function statusFromMotionScore(score: number, type: MachineType): MachineStatus {
  // Running machines have higher motion due to drum rotation
  // Thresholds are empirical - may need adjustment
  const threshold = type === 'washer' ? 15 : 10; // Washers may have more visible motion

  if (score > threshold) {
    return 'running';
  } else if (score >= 0) {
    return 'idle';
  }
  return 'unknown';
}

/**
 * Analyze a camera frame to detect machine statuses.
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
  const cacheKey = `${agentId}:${cameraPosition}`;
  const prevFrame = previousFrameData.get(cacheKey);

  const results: LaundryMachine[] = [];
  const now = Date.now();

  for (const machine of cameraMachines) {
    let status: MachineStatus = 'unknown';

    if (prevFrame && prevFrame.length === frameBuffer.length) {
      const motionScore = calculateMotionScore(
        prevFrame,
        frameBuffer,
        frameWidth,
        frameHeight,
        machine
      );
      status = statusFromMotionScore(motionScore, machine.type);
    }

    results.push({
      id: machine.id,
      label: machine.label,
      type: machine.type,
      status,
      lastUpdated: now,
    });
  }

  // Store current frame for next comparison
  previousFrameData.set(cacheKey, Buffer.from(frameBuffer));

  return results;
}

/**
 * Get machine configuration for a laundry.
 */
export function getMachineConfig(agentId: string): LaundryMachineConfig | undefined {
  return MACHINE_CONFIGS.find(c => c.agentId === agentId);
}

/**
 * Clear cached frame data (useful when camera restarts or for testing).
 */
export function clearFrameCache(agentId?: string): void {
  if (agentId) {
    previousFrameData.delete(`${agentId}:front`);
    previousFrameData.delete(`${agentId}:back`);
  } else {
    previousFrameData.clear();
  }
}
