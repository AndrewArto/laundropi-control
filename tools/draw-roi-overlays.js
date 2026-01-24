#!/usr/bin/env node
/**
 * Draw ROI overlays on captured camera frames.
 * Usage: node tools/draw-roi-overlays.js
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const OUTPUT_DIR = path.join(__dirname, 'roi-calibration');

// ROI configurations from machineDetection.ts (calibrated 2026-01-24)
const CONFIGS = {
  brandoa1_front: [
    // 4 washers (recalibrated 2026-01-24 - targeting LCD screens)
    { id: 'w1', label: 'W1', type: 'washer',
      drum: { x: 0.019, y: 0.707, width: 0.141, height: 0.241 },
      display: { x: 0.078, y: 0.465, width: 0.045, height: 0.030 } },
    { id: 'w2', label: 'W2', type: 'washer',
      drum: { x: 0.217, y: 0.541, width: 0.143, height: 0.262 },
      display: { x: 0.210, y: 0.355, width: 0.045, height: 0.030 } },
    { id: 'w3', label: 'W3', type: 'washer',
      drum: { x: 0.394, y: 0.391, width: 0.131, height: 0.247 },
      display: { x: 0.395, y: 0.270, width: 0.035, height: 0.022 } },
    { id: 'w4', label: 'W4', type: 'washer',
      drum: { x: 0.559, y: 0.275, width: 0.074, height: 0.226 },
      display: { x: 0.555, y: 0.175, width: 0.030, height: 0.020 } },
  ],
  brandoa1_back: [
    // 4 dryers
    { id: 'd5', label: 'D5', type: 'dryer',
      drum: { x: 0.655, y: 0.141, width: 0.140, height: 0.287 },
      display: { x: 0.616, y: 0.392, width: 0.033, height: 0.054 } },
    { id: 'd6', label: 'D6', type: 'dryer',
      drum: { x: 0.853, y: 0.239, width: 0.154, height: 0.370 },
      display: { x: 0.765, y: 0.493, width: 0.034, height: 0.064 } },
    { id: 'd7', label: 'D7', type: 'dryer',
      drum: { x: 0.624, y: 0.563, width: 0.120, height: 0.280 },
      display: { x: 0.810, y: 0.529, width: 0.037, height: 0.066 } },
    { id: 'd8', label: 'D8', type: 'dryer',
      drum: { x: 0.790, y: 0.750, width: 0.147, height: 0.228 },
      display: { x: 0.963, y: 0.656, width: 0.037, height: 0.075 } },
  ],
  brandoa2_front: [
    // 4 washers
    { id: 'w1', label: 'W1', type: 'washer',
      drum: { x: 0.522, y: 0.251, width: 0.049, height: 0.167 },
      display: { x: 0.526, y: 0.188, width: 0.046, height: 0.051 } },
    { id: 'w2', label: 'W2', type: 'washer',
      drum: { x: 0.436, y: 0.324, width: 0.071, height: 0.210 },
      display: { x: 0.449, y: 0.233, width: 0.053, height: 0.053 } },
    { id: 'w3', label: 'W3', type: 'washer',
      drum: { x: 0.324, y: 0.411, width: 0.097, height: 0.229 },
      display: { x: 0.344, y: 0.317, width: 0.037, height: 0.048 } },
    { id: 'w4', label: 'W4', type: 'washer',
      drum: { x: 0.142, y: 0.557, width: 0.136, height: 0.275 },
      display: { x: 0.161, y: 0.449, width: 0.046, height: 0.053 } },
  ],
  brandoa2_back: [
    // 6 dryers (recalibrated 2026-01-24)
    { id: 'd1', label: 'D1', type: 'dryer',
      drum: { x: 0.772, y: 0.632, width: 0.108, height: 0.214 },
      display: { x: 0.887, y: 0.562, width: 0.032, height: 0.059 } },
    { id: 'd2', label: 'D2', type: 'dryer',
      drum: { x: 0.823, y: 0.271, width: 0.095, height: 0.249 },
      display: { x: 0.788, y: 0.475, width: 0.028, height: 0.049 } },
    { id: 'd3', label: 'D3', type: 'dryer',
      drum: { x: 0.685, y: 0.523, width: 0.075, height: 0.200 },
      display: { x: 0.762, y: 0.450, width: 0.024, height: 0.051 } },
    { id: 'd4', label: 'D4', type: 'dryer',
      drum: { x: 0.710, y: 0.204, width: 0.067, height: 0.218 },
      display: { x: 0.685, y: 0.382, width: 0.022, height: 0.049 } },
    { id: 'd5', label: 'D5', type: 'dryer',
      drum: { x: 0.604, y: 0.431, width: 0.067, height: 0.198 },
      display: { x: 0.663, y: 0.362, width: 0.022, height: 0.047 } },
    { id: 'd6', label: 'D6', type: 'dryer',
      drum: { x: 0.621, y: 0.155, width: 0.057, height: 0.173 },
      display: { x: 0.602, y: 0.314, width: 0.020, height: 0.046 } },
  ],
};

async function drawROIs(inputPath, outputPath, machines) {
  const image = await loadImage(inputPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the original image
  ctx.drawImage(image, 0, 0);

  const w = image.width;
  const h = image.height;

  // Draw ROIs for each machine
  for (const machine of machines) {
    // Draw drum region (green, dashed)
    if (machine.drum) {
      const d = machine.drum;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(d.x * w, d.y * h, d.width * w, d.height * h);

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fillRect(d.x * w, d.y * h, d.width * w, d.height * h);

      // Label background
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(d.x * w, d.y * h - 22, 55, 20);

      // Label text
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${machine.label} D`, d.x * w + 5, d.y * h - 7);
    }

    // Draw display region (red, dashed)
    if (machine.display) {
      const s = machine.display;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(s.x * w, s.y * h, s.width * w, s.height * h);

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      ctx.fillRect(s.x * w, s.y * h, s.width * w, s.height * h);

      // Label background
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(s.x * w, s.y * h - 22, 55, 20);

      // Label text
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${machine.label} S`, s.x * w + 5, s.y * h - 7);
    }
  }

  // Add legend
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(10, h - 60, 180, 50);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('Green (D) = Drum/Clothes', 20, h - 40);

  ctx.fillStyle = '#ef4444';
  ctx.fillText('Red (S) = Screen/Display', 20, h - 20);

  // Save output
  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created: ${outputPath}`);
}

async function main() {
  const cameras = ['brandoa1_front', 'brandoa1_back', 'brandoa2_front', 'brandoa2_back'];

  for (const camera of cameras) {
    const inputPath = path.join(OUTPUT_DIR, `${camera}_raw.jpg`);
    const outputPath = path.join(OUTPUT_DIR, `${camera}_roi.jpg`);

    if (!fs.existsSync(inputPath)) {
      console.log(`Skipping ${camera}: raw image not found`);
      continue;
    }

    const machines = CONFIGS[camera];
    if (!machines) {
      console.log(`Skipping ${camera}: no config found`);
      continue;
    }

    await drawROIs(inputPath, outputPath, machines);
  }

  console.log('\nDone! Check tools/roi-calibration/ for the output images.');
}

main().catch(console.error);
