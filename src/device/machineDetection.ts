/**
 * Machine status detection via camera frame analysis.
 *
 * Three-criteria detection (ROI-based, no ML):
 * 1. Display: Dark = IDLE (definitive), Lit = could be either
 * 2. Lid: Open = IDLE (definitive), Closed = could be either
 * 3. Clothes in drum: Yes = RUNNING (definitive), No = could be either
 *
 * Decision logic:
 * - If clothes visible → RUNNING (highest priority)
 * - Else if display is off → IDLE
 * - Else if lid is open → IDLE
 * - Else → RUNNING (display on, lid closed, no clothes visible but could be running)
 *
 * Washer layout: Display is centered above the drum
 * Dryer layout: Stacked in columns of 2, display in middle of column
 *   - Top dryer: display on left side of middle section
 *   - Bottom dryer: display on right side of middle section
 */

import * as fs from 'fs';
import * as path from 'path';
import type { LaundryMachine, MachineStatus, MachineType } from '../../types';

// Training data collection
const TRAINING_DATA_DIR = '/tmp/machine-detection-frames';
const SAVE_FRAMES_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SAVE_FRAMES_MAX_COUNT = 1000;
const OPERATING_HOURS_START = 7; // 07:00
const OPERATING_HOURS_END = 1; // 01:00 (next day)
let lastFrameSaveTime = 0;

// ROI (Region of Interest) definition
interface ROI {
  x: number;      // normalized 0-1
  y: number;      // normalized 0-1
  width: number;  // normalized 0-1
  height: number; // normalized 0-1
}

// Machine region configuration with all three ROIs
export interface MachineRegion {
  id: string;
  label: string;
  type: MachineType;
  camera: 'front' | 'back';
  drum: ROI;       // Clothes detection region
  display: ROI;    // Control display region
  lid?: ROI;       // Lid/door region (optional, uses drum area if not specified)
}

// Detection thresholds
interface DetectionThresholds {
  displayBrightnessOn: number;    // Display is ON if brightness > this
  clothesVariance: number;        // Clothes present if variance > this
  lidOpenBrightness: number;      // Lid is OPEN if brightness > this (light visible through open door)
}

export interface LaundryMachineConfig {
  agentId: string;
  machines: MachineRegion[];
  thresholds: DetectionThresholds;
}

// Machine configurations for each laundry
export const MACHINE_CONFIGS: LaundryMachineConfig[] = [
  {
    agentId: 'Brandoa1',
    thresholds: {
      displayBrightnessOn: 50,
      clothesVariance: 100,
      lidOpenBrightness: 80,
    },
    machines: [
      // Front camera - 4 washers (recalibrated 2026-01-24 - targeting LCD screens)
      {
        id: 'w1', label: 'W1', type: 'washer', camera: 'front',
        drum: { x: 0.019, y: 0.707, width: 0.141, height: 0.241 },
        display: { x: 0.078, y: 0.465, width: 0.045, height: 0.030 },
      },
      {
        id: 'w2', label: 'W2', type: 'washer', camera: 'front',
        drum: { x: 0.217, y: 0.541, width: 0.143, height: 0.262 },
        display: { x: 0.210, y: 0.355, width: 0.045, height: 0.030 },
      },
      {
        id: 'w3', label: 'W3', type: 'washer', camera: 'front',
        drum: { x: 0.394, y: 0.391, width: 0.131, height: 0.247 },
        display: { x: 0.395, y: 0.270, width: 0.035, height: 0.022 },
      },
      {
        id: 'w4', label: 'W4', type: 'washer', camera: 'front',
        drum: { x: 0.559, y: 0.275, width: 0.074, height: 0.226 },
        display: { x: 0.555, y: 0.175, width: 0.030, height: 0.020 },
      },
      // Back camera - 4 dryers (shows dryers in UI)
      {
        id: 'd5', label: 'D5', type: 'dryer', camera: 'back',
        drum: { x: 0.655, y: 0.141, width: 0.140, height: 0.287 },
        display: { x: 0.616, y: 0.392, width: 0.033, height: 0.054 },
      },
      {
        id: 'd6', label: 'D6', type: 'dryer', camera: 'back',
        drum: { x: 0.853, y: 0.239, width: 0.154, height: 0.370 },
        display: { x: 0.765, y: 0.493, width: 0.034, height: 0.064 },
      },
      {
        id: 'd7', label: 'D7', type: 'dryer', camera: 'back',
        drum: { x: 0.624, y: 0.563, width: 0.120, height: 0.280 },
        display: { x: 0.810, y: 0.529, width: 0.037, height: 0.066 },
      },
      {
        id: 'd8', label: 'D8', type: 'dryer', camera: 'back',
        drum: { x: 0.790, y: 0.750, width: 0.147, height: 0.228 },
        display: { x: 0.963, y: 0.656, width: 0.037, height: 0.075 },
      },
    ],
  },
  {
    agentId: 'Brandoa2',
    thresholds: {
      displayBrightnessOn: 50,
      clothesVariance: 100,
      lidOpenBrightness: 80,
    },
    machines: [
      // Front camera - 4 washers (calibrated 2026-01-24)
      {
        id: 'w1', label: 'W1', type: 'washer', camera: 'front',
        drum: { x: 0.522, y: 0.251, width: 0.049, height: 0.167 },
        display: { x: 0.526, y: 0.188, width: 0.046, height: 0.051 },
      },
      {
        id: 'w2', label: 'W2', type: 'washer', camera: 'front',
        drum: { x: 0.436, y: 0.324, width: 0.071, height: 0.210 },
        display: { x: 0.449, y: 0.233, width: 0.053, height: 0.053 },
      },
      {
        id: 'w3', label: 'W3', type: 'washer', camera: 'front',
        drum: { x: 0.324, y: 0.411, width: 0.097, height: 0.229 },
        display: { x: 0.344, y: 0.317, width: 0.037, height: 0.048 },
      },
      {
        id: 'w4', label: 'W4', type: 'washer', camera: 'front',
        drum: { x: 0.142, y: 0.557, width: 0.136, height: 0.275 },
        display: { x: 0.161, y: 0.449, width: 0.046, height: 0.053 },
      },
      // Back camera - 6 dryers (recalibrated 2026-01-24)
      {
        id: 'd1', label: 'D1', type: 'dryer', camera: 'back',
        drum: { x: 0.772, y: 0.632, width: 0.108, height: 0.214 },
        display: { x: 0.887, y: 0.562, width: 0.032, height: 0.059 },
      },
      {
        id: 'd2', label: 'D2', type: 'dryer', camera: 'back',
        drum: { x: 0.823, y: 0.271, width: 0.095, height: 0.249 },
        display: { x: 0.788, y: 0.475, width: 0.028, height: 0.049 },
      },
      {
        id: 'd3', label: 'D3', type: 'dryer', camera: 'back',
        drum: { x: 0.685, y: 0.523, width: 0.075, height: 0.200 },
        display: { x: 0.762, y: 0.450, width: 0.024, height: 0.051 },
      },
      {
        id: 'd4', label: 'D4', type: 'dryer', camera: 'back',
        drum: { x: 0.710, y: 0.204, width: 0.067, height: 0.218 },
        display: { x: 0.685, y: 0.382, width: 0.022, height: 0.049 },
      },
      {
        id: 'd5', label: 'D5', type: 'dryer', camera: 'back',
        drum: { x: 0.604, y: 0.431, width: 0.067, height: 0.198 },
        display: { x: 0.663, y: 0.362, width: 0.022, height: 0.047 },
      },
      {
        id: 'd6', label: 'D6', type: 'dryer', camera: 'back',
        drum: { x: 0.621, y: 0.155, width: 0.057, height: 0.173 },
        display: { x: 0.602, y: 0.314, width: 0.020, height: 0.046 },
      },
    ],
  },
];

/**
 * Analyze a region and return pixel statistics.
 */
function analyzeRegion(
  buffer: Buffer,
  width: number,
  height: number,
  region: ROI
): { avgBrightness: number; variance: number; pixelCount: number } {
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
    return { avgBrightness: 0, variance: 0, pixelCount: 0 };
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

  return { avgBrightness, variance, pixelCount: pixels.length };
}

/**
 * Check if current time is within operating hours (07:00 - 01:00).
 */
function isWithinOperatingHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= OPERATING_HOURS_START || hour < OPERATING_HOURS_END;
}

/**
 * Save full frame as JPEG for training data collection.
 */
export function saveFrameForTraining(
  agentId: string,
  cameraPosition: 'front' | 'back',
  jpegBuffer: Buffer
): void {
  const now = Date.now();

  if (now - lastFrameSaveTime < SAVE_FRAMES_INTERVAL) {
    return;
  }

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
 */
export function setJpegBufferForTraining(jpeg: Buffer): void {
  pendingJpegBuffer = jpeg;
}

/**
 * Analyze a camera frame to detect machine statuses using three-criteria approach.
 *
 * Decision logic:
 * 1. Clothes visible in drum → RUNNING (highest priority, overrides everything)
 * 2. Display is off (dark) → IDLE
 * 3. Lid is open (high brightness in drum area) → IDLE
 * 4. Otherwise (display on, lid closed, no visible clothes) → RUNNING
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
  const { displayBrightnessOn, clothesVariance, lidOpenBrightness } = config.thresholds;
  const results: LaundryMachine[] = [];
  const now = Date.now();

  for (const machine of cameraMachines) {
    // Analyze all three regions
    const displayStats = analyzeRegion(frameBuffer, frameWidth, frameHeight, machine.display);
    const drumStats = analyzeRegion(frameBuffer, frameWidth, frameHeight, machine.drum);

    // Criteria evaluation
    const displayIsOn = displayStats.avgBrightness > displayBrightnessOn;
    const hasClothes = drumStats.variance > clothesVariance;
    const lidIsOpen = drumStats.avgBrightness > lidOpenBrightness;

    // Decision logic
    let status: MachineStatus;
    let reason: string;

    if (hasClothes) {
      // Clothes visible = definitely running
      status = 'running';
      reason = 'clothes';
    } else if (!displayIsOn) {
      // Display off = definitely idle
      status = 'idle';
      reason = 'display-off';
    } else if (lidIsOpen) {
      // Lid open (high brightness in drum) = idle
      status = 'idle';
      reason = 'lid-open';
    } else {
      // Display on, lid closed, no visible clothes = assume running
      status = 'running';
      reason = 'display-on';
    }

    console.log(
      `[Detection] ${machine.label}: ${status} (${reason}) - ` +
      `display=${displayStats.avgBrightness.toFixed(1)} (>${displayBrightnessOn}=${displayIsOn ? 'ON' : 'OFF'}), ` +
      `clothes-var=${drumStats.variance.toFixed(1)} (>${clothesVariance}=${hasClothes}), ` +
      `drum-bright=${drumStats.avgBrightness.toFixed(1)} (>${lidOpenBrightness}=${lidIsOpen ? 'OPEN' : 'CLOSED'})`
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
  // No frame cache needed for ROI-based detection
}
