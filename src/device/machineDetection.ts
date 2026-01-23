/**
 * Machine status detection via camera frame analysis.
 *
 * Multi-criteria detection approach:
 * 1. Display: Dark = always OFF, Lit = could be either state
 * 2. Lid: Open = always OFF, Closed = could be either state
 * 3. Clothes inside drum: Yes = always ON, No = always OFF
 *
 * Decision logic: Machine is ON only if display is lit AND lid is closed AND clothes visible.
 * Speed Queen front-load machines have digital screens and glass drum doors.
 */

import type { LaundryMachine, MachineStatus, MachineType } from '../../types';

// Machine region configuration with separate areas for screen, lid, and drum
export interface MachineRegion {
  id: string;
  label: string;
  type: MachineType;
  camera: 'front' | 'back';
  // Screen region (for display detection)
  screen: { x: number; y: number; width: number; height: number };
  // Drum/window region (for clothes detection)
  drum: { x: number; y: number; width: number; height: number };
  // Lid region - optional, for detecting open lid (bright area where door is open)
  lid?: { x: number; y: number; width: number; height: number };
}

export interface LaundryMachineConfig {
  agentId: string;
  machines: MachineRegion[];
  // Brightness threshold for screen "lit" detection
  screenBrightnessThreshold?: number;
  // Threshold for detecting clothes (color variance in drum area)
  clothesVarianceThreshold?: number;
  // Threshold for detecting open lid (high brightness in lid area)
  lidOpenBrightnessThreshold?: number;
}

// Machine configurations for each laundry
// Coordinates are percentages of frame (0-1)
export const MACHINE_CONFIGS: LaundryMachineConfig[] = [
  {
    agentId: 'Brandoa1',
    screenBrightnessThreshold: 150,
    clothesVarianceThreshold: 25,
    lidOpenBrightnessThreshold: 200,
    machines: [
      // Front camera - 4 washers
      {
        id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front',
        screen: { x: 0.04, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.02, y: 0.35, width: 0.09, height: 0.15 },
      },
      {
        id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front',
        screen: { x: 0.15, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.13, y: 0.35, width: 0.09, height: 0.15 },
      },
      {
        id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front',
        screen: { x: 0.26, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.24, y: 0.35, width: 0.09, height: 0.15 },
      },
      {
        id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front',
        screen: { x: 0.37, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.35, y: 0.35, width: 0.09, height: 0.15 },
      },
      // Front camera - 4 dryers (2x2 stack)
      {
        id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'front',
        screen: { x: 0.72, y: 0.15, width: 0.04, height: 0.03 },
        drum: { x: 0.70, y: 0.20, width: 0.10, height: 0.15 },
      },
      {
        id: 'd7', label: 'Dryer 7', type: 'dryer', camera: 'front',
        screen: { x: 0.86, y: 0.15, width: 0.04, height: 0.03 },
        drum: { x: 0.84, y: 0.20, width: 0.10, height: 0.15 },
      },
      {
        id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'front',
        screen: { x: 0.72, y: 0.45, width: 0.04, height: 0.03 },
        drum: { x: 0.70, y: 0.50, width: 0.10, height: 0.15 },
      },
      {
        id: 'd8', label: 'Dryer 8', type: 'dryer', camera: 'front',
        screen: { x: 0.86, y: 0.45, width: 0.04, height: 0.03 },
        drum: { x: 0.84, y: 0.50, width: 0.10, height: 0.15 },
      },
    ],
  },
  {
    agentId: 'Brandoa2',
    screenBrightnessThreshold: 150,
    clothesVarianceThreshold: 25,
    lidOpenBrightnessThreshold: 200,
    machines: [
      // Front camera - 4 washers
      {
        id: 'w1', label: 'Washer 1', type: 'washer', camera: 'front',
        screen: { x: 0.08, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.06, y: 0.35, width: 0.09, height: 0.15 },
      },
      {
        id: 'w2', label: 'Washer 2', type: 'washer', camera: 'front',
        screen: { x: 0.23, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.21, y: 0.35, width: 0.09, height: 0.15 },
      },
      {
        id: 'w3', label: 'Washer 3', type: 'washer', camera: 'front',
        screen: { x: 0.38, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.36, y: 0.35, width: 0.09, height: 0.15 },
      },
      {
        id: 'w4', label: 'Washer 4', type: 'washer', camera: 'front',
        screen: { x: 0.53, y: 0.28, width: 0.05, height: 0.04 },
        drum: { x: 0.51, y: 0.35, width: 0.09, height: 0.15 },
      },
      // Back camera - 6 dryers (2 rows of 3)
      // Top row
      {
        id: 'd1', label: 'Dryer 1', type: 'dryer', camera: 'back',
        screen: { x: 0.30, y: 0.15, width: 0.04, height: 0.03 },
        drum: { x: 0.28, y: 0.20, width: 0.10, height: 0.15 },
      },
      {
        id: 'd3', label: 'Dryer 3', type: 'dryer', camera: 'back',
        screen: { x: 0.48, y: 0.15, width: 0.04, height: 0.03 },
        drum: { x: 0.46, y: 0.20, width: 0.10, height: 0.15 },
      },
      {
        id: 'd5', label: 'Dryer 5', type: 'dryer', camera: 'back',
        screen: { x: 0.66, y: 0.15, width: 0.04, height: 0.03 },
        drum: { x: 0.64, y: 0.20, width: 0.10, height: 0.15 },
      },
      // Bottom row
      {
        id: 'd2', label: 'Dryer 2', type: 'dryer', camera: 'back',
        screen: { x: 0.30, y: 0.45, width: 0.04, height: 0.03 },
        drum: { x: 0.28, y: 0.50, width: 0.10, height: 0.15 },
      },
      {
        id: 'd4', label: 'Dryer 4', type: 'dryer', camera: 'back',
        screen: { x: 0.48, y: 0.45, width: 0.04, height: 0.03 },
        drum: { x: 0.46, y: 0.50, width: 0.10, height: 0.15 },
      },
      {
        id: 'd6', label: 'Dryer 6', type: 'dryer', camera: 'back',
        screen: { x: 0.66, y: 0.45, width: 0.04, height: 0.03 },
        drum: { x: 0.64, y: 0.50, width: 0.10, height: 0.15 },
      },
    ],
  },
];

/**
 * Analyze region brightness (for screen and lid detection).
 */
function analyzeRegionBrightness(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number }
): { avgBrightness: number; maxBrightness: number } {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  let sumBrightness = 0;
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
        sumBrightness += brightness;
        pixelCount++;

        if (brightness > maxBrightness) {
          maxBrightness = brightness;
        }
      }
    }
  }

  return {
    avgBrightness: pixelCount > 0 ? sumBrightness / pixelCount : 0,
    maxBrightness,
  };
}

/**
 * Detect clothes in drum by analyzing color variance.
 * Empty drum: uniform gray/black (low variance)
 * Clothes present: varied colors (high variance)
 */
function detectClothesInDrum(
  buffer: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; width: number; height: number }
): { hasClothes: boolean; colorVariance: number } {
  const startX = Math.floor(region.x * width);
  const startY = Math.floor(region.y * height);
  const regionWidth = Math.floor(region.width * width);
  const regionHeight = Math.floor(region.height * height);

  const pixels: { r: number; g: number; b: number }[] = [];

  for (let y = startY; y < startY + regionHeight && y < height; y++) {
    for (let x = startX; x < startX + regionWidth && x < width; x++) {
      const idx = (y * width + x) * 3;
      if (idx + 2 < buffer.length) {
        pixels.push({
          r: buffer[idx],
          g: buffer[idx + 1],
          b: buffer[idx + 2],
        });
      }
    }
  }

  if (pixels.length === 0) {
    return { hasClothes: false, colorVariance: 0 };
  }

  // Calculate mean RGB
  const mean = {
    r: pixels.reduce((sum, p) => sum + p.r, 0) / pixels.length,
    g: pixels.reduce((sum, p) => sum + p.g, 0) / pixels.length,
    b: pixels.reduce((sum, p) => sum + p.b, 0) / pixels.length,
  };

  // Calculate variance (standard deviation of color distances from mean)
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

  return { hasClothes: variance > 25, colorVariance: variance };
}

/**
 * Check if lid is open by detecting high brightness in lid area.
 * Open lid typically shows interior lighting or external light.
 */
function isLidOpen(
  buffer: Buffer,
  width: number,
  height: number,
  lidRegion: { x: number; y: number; width: number; height: number } | undefined,
  threshold: number
): boolean {
  if (!lidRegion) {
    // No lid region defined, assume closed
    return false;
  }

  const { avgBrightness } = analyzeRegionBrightness(buffer, width, height, lidRegion);
  return avgBrightness > threshold;
}

/**
 * Multi-criteria machine status detection.
 *
 * Logic:
 * - Display dark → OFF (machine not running)
 * - Lid open → OFF (can't run with open lid)
 * - No clothes in drum → OFF (nothing to wash/dry)
 * - Display lit + lid closed + clothes visible → ON
 */
function detectMachineStatus(
  buffer: Buffer,
  width: number,
  height: number,
  machine: MachineRegion,
  config: {
    screenBrightnessThreshold: number;
    clothesVarianceThreshold: number;
    lidOpenBrightnessThreshold: number;
  }
): { status: MachineStatus; debug: { screenLit: boolean; lidOpen: boolean; hasClothes: boolean; screenBrightness: number; colorVariance: number } } {
  // 1. Check screen brightness
  const { avgBrightness: screenBrightness } = analyzeRegionBrightness(
    buffer, width, height, machine.screen
  );
  const screenLit = screenBrightness > config.screenBrightnessThreshold;

  // 2. Check if lid is open (optional check)
  const lidOpen = isLidOpen(
    buffer, width, height, machine.lid, config.lidOpenBrightnessThreshold
  );

  // 3. Check for clothes in drum
  const { hasClothes, colorVariance } = detectClothesInDrum(
    buffer, width, height, machine.drum
  );

  const debug = { screenLit, lidOpen, hasClothes, screenBrightness, colorVariance };

  // Decision logic:
  // - Dark screen = definitely OFF
  if (!screenLit) {
    return { status: 'idle', debug };
  }

  // - Open lid = definitely OFF
  if (lidOpen) {
    return { status: 'idle', debug };
  }

  // - No clothes = definitely OFF (even if screen is lit, could be just standby)
  if (!hasClothes) {
    return { status: 'idle', debug };
  }

  // All conditions met: screen lit + lid closed + clothes visible = RUNNING
  return { status: 'running', debug };
}

/**
 * Analyze a camera frame to detect machine statuses.
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
  const detectionConfig = {
    screenBrightnessThreshold: config.screenBrightnessThreshold ?? 150,
    clothesVarianceThreshold: config.clothesVarianceThreshold ?? 25,
    lidOpenBrightnessThreshold: config.lidOpenBrightnessThreshold ?? 200,
  };

  const results: LaundryMachine[] = [];
  const now = Date.now();

  for (const machine of cameraMachines) {
    const { status, debug } = detectMachineStatus(
      frameBuffer,
      frameWidth,
      frameHeight,
      machine,
      detectionConfig
    );

    // Log debug info for tuning
    console.log(
      `[Detection] ${machine.label}: status=${status}, ` +
      `screenLit=${debug.screenLit} (${debug.screenBrightness.toFixed(1)}), ` +
      `lidOpen=${debug.lidOpen}, hasClothes=${debug.hasClothes} (var=${debug.colorVariance.toFixed(1)})`
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
 * Clear cached frame data (kept for API compatibility).
 */
export function clearFrameCache(_agentId?: string): void {
  // No longer using frame cache since we removed motion detection
}
