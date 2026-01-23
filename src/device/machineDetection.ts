/**
 * Machine status detection via camera frame analysis.
 *
 * Three-criteria detection:
 * 1. Display: Dark = always OFF, Lit = could be either state
 * 2. Lid: Open = always OFF, Closed = could be either state
 * 3. Clothes inside: Yes = always ON, No = always OFF
 *
 * Priority: Clothes visible → ON (overrides display state)
 *
 * Also saves frames for ML training data collection.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LaundryMachine, MachineStatus, MachineType } from '../../types';

// Training data collection directory
const TRAINING_DATA_DIR = '/tmp/machine-detection-frames';
const SAVE_FRAMES_INTERVAL = 10 * 60 * 1000; // Save frames every 10 minutes
const SAVE_FRAMES_MAX_COUNT = 1000; // Keep up to 1000 frames per camera
const OPERATING_HOURS_START = 7; // 07:00
const OPERATING_HOURS_END = 1; // 01:00 (next day)
let lastFrameSaveTime = 0;

// Machine region configuration
export interface MachineRegion {
  id: string;
  label: string;
  type: MachineType;
  camera: 'front' | 'back';
  // Drum/window region for clothes detection
  drum: { x: number; y: number; width: number; height: number };
}

export interface LaundryMachineConfig {
  agentId: string;
  machines: MachineRegion[];
  // Color variance threshold for clothes detection
  clothesVarianceThreshold?: number;
}

// Machine configurations for each laundry
export const MACHINE_CONFIGS: LaundryMachineConfig[] = [
  {
    agentId: 'Brandoa1',
    clothesVarianceThreshold: 40,
    machines: [
      // Front camera - 4 washers
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', drum: { x: 0.02, y: 0.35, width: 0.09, height: 0.15 } },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', drum: { x: 0.13, y: 0.35, width: 0.09, height: 0.15 } },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', drum: { x: 0.24, y: 0.35, width: 0.09, height: 0.15 } },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', drum: { x: 0.35, y: 0.35, width: 0.09, height: 0.15 } },
      // Front camera - 4 dryers (2x2 stack)
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'front', drum: { x: 0.70, y: 0.20, width: 0.10, height: 0.15 } },
      { id: 'd7', label: 'Dryer 7', type: 'dryer', camera: 'front', drum: { x: 0.84, y: 0.20, width: 0.10, height: 0.15 } },
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'front', drum: { x: 0.70, y: 0.50, width: 0.10, height: 0.15 } },
      { id: 'd8', label: 'Dryer 8', type: 'dryer', camera: 'front', drum: { x: 0.84, y: 0.50, width: 0.10, height: 0.15 } },
    ],
  },
  {
    agentId: 'Brandoa2',
    clothesVarianceThreshold: 40,
    machines: [
      // Front camera - 4 washers
      { id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front', drum: { x: 0.06, y: 0.35, width: 0.09, height: 0.15 } },
      { id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front', drum: { x: 0.21, y: 0.35, width: 0.09, height: 0.15 } },
      { id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front', drum: { x: 0.36, y: 0.35, width: 0.09, height: 0.15 } },
      { id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front', drum: { x: 0.51, y: 0.35, width: 0.09, height: 0.15 } },
      // Back camera - 6 dryers (2 rows of 3)
      { id: 'd1', label: 'Dryer 1', type: 'dryer', camera: 'back', drum: { x: 0.28, y: 0.20, width: 0.10, height: 0.15 } },
      { id: 'd3', label: 'Dryer 3', type: 'dryer', camera: 'back', drum: { x: 0.46, y: 0.20, width: 0.10, height: 0.15 } },
      { id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'back', drum: { x: 0.64, y: 0.20, width: 0.10, height: 0.15 } },
      { id: 'd2', label: 'Dryer 2', type: 'dryer', camera: 'back', drum: { x: 0.28, y: 0.50, width: 0.10, height: 0.15 } },
      { id: 'd4', label: 'Dryer 4', type: 'dryer', camera: 'back', drum: { x: 0.46, y: 0.50, width: 0.10, height: 0.15 } },
      { id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'back', drum: { x: 0.64, y: 0.50, width: 0.10, height: 0.15 } },
    ],
  },
];

/**
 * Detect clothes in drum by analyzing color variance.
 * Empty drum: uniform dark color (low variance)
 * Clothes present: varied colors/textures (high variance)
 */
function detectClothesInDrum(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number },
  threshold: number
): { hasClothes: boolean; variance: number; avgBrightness: number } {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  const pixels: { r: number; g: number; b: number }[] = [];
  let sumBrightness = 0;

  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < buffer.length) {
        const r = buffer[idx];
        const g = buffer[idx + 1];
        const b = buffer[idx + 2];
        pixels.push({ r, g, b });
        sumBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }
  }

  if (pixels.length === 0) {
    return { hasClothes: false, variance: 0, avgBrightness: 0 };
  }

  const avgBrightness = sumBrightness / pixels.length;

  // Calculate mean RGB
  const mean = {
    r: pixels.reduce((sum, p) => sum + p.r, 0) / pixels.length,
    g: pixels.reduce((sum, p) => sum + p.g, 0) / pixels.length,
    b: pixels.reduce((sum, p) => sum + p.b, 0) / pixels.length,
  };

  // Calculate color variance (std dev of color distances from mean)
  const variance = Math.sqrt(
    pixels.reduce((sum, p) => {
      const dist = Math.sqrt(
        (p.r - mean.r) ** 2 +
        (p.g - mean.g) ** 2 +
        (p.b - mean.b) ** 2
      );
      return sum + dist * dist;
    }, 0) / pixels.length
  );

  return { hasClothes: variance > threshold, variance, avgBrightness };
}

/**
 * Check if current time is within operating hours (07:00 - 01:00).
 */
function isWithinOperatingHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  // Operating hours: 07:00 to 01:00 (next day)
  // This means: hour >= 7 OR hour < 1
  return hour >= OPERATING_HOURS_START || hour < OPERATING_HOURS_END;
}

/**
 * Save full frame as JPEG for training data collection.
 * Only saves during operating hours (07:00 - 01:00) every 10 minutes.
 */
function saveFrameForTraining(
  agentId: string,
  cameraPosition: 'front' | 'back',
  jpegBuffer: Buffer
): void {
  const now = Date.now();

  // Check time interval
  if (now - lastFrameSaveTime < SAVE_FRAMES_INTERVAL) {
    return;
  }

  // Only save during operating hours
  if (!isWithinOperatingHours()) {
    return;
  }

  lastFrameSaveTime = now;

  try {
    const dir = path.join(TRAINING_DATA_DIR, agentId, cameraPosition);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}.jpg`;
    const filepath = path.join(dir, filename);

    fs.writeFileSync(filepath, jpegBuffer);
    console.log(`[Training] Saved frame: ${filepath}`);

    // Clean up old files (keep last SAVE_FRAMES_MAX_COUNT per camera)
    const files = fs.readdirSync(dir).sort().reverse();
    if (files.length > SAVE_FRAMES_MAX_COUNT) {
      for (const file of files.slice(SAVE_FRAMES_MAX_COUNT)) {
        fs.unlinkSync(path.join(dir, file));
      }
    }
  } catch (err) {
    console.error('[Training] Failed to save frame:', err);
  }
}

// Store original JPEG for training data
let pendingJpegBuffer: Buffer | null = null;

/**
 * Set the original JPEG buffer for training data collection.
 * Call this before analyzeFrame with the raw JPEG from camera.
 */
export function setJpegBufferForTraining(jpeg: Buffer): void {
  pendingJpegBuffer = jpeg;
}

/**
 * Analyze a camera frame to detect machine statuses.
 *
 * Logic:
 * - Clothes visible in drum → RUNNING (machine occupied)
 * - No clothes visible → IDLE (machine available)
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

  // Save frame for training data
  if (pendingJpegBuffer) {
    saveFrameForTraining(agentId, cameraPosition, pendingJpegBuffer);
    pendingJpegBuffer = null;
  }

  const cameraMachines = config.machines.filter(m => m.camera === cameraPosition);
  const threshold = config.clothesVarianceThreshold ?? 40;
  const results: LaundryMachine[] = [];
  const now = Date.now();

  for (const machine of cameraMachines) {
    const { hasClothes, variance, avgBrightness } = detectClothesInDrum(
      frameBuffer, frameWidth, frameHeight, machine.drum, threshold
    );

    // Clothes in drum = occupied (running), empty = available (idle)
    const status: MachineStatus = hasClothes ? 'running' : 'idle';

    console.log(
      `[Detection] ${machine.label}: ${status} - ` +
      `variance=${variance.toFixed(1)} (threshold=${threshold}), ` +
      `brightness=${avgBrightness.toFixed(1)}`
    );

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
 * Clear cached frame data.
 */
export function clearFrameCache(_agentId?: string): void {
  // No frame cache needed for variance-based detection
}
