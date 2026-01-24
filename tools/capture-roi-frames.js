#!/usr/bin/env node
/**
 * Capture frames from cameras via WebSocket and overlay ROI regions.
 * Usage: node tools/capture-roi-frames.js
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const OUTPUT_DIR = path.join(__dirname, 'roi-calibration');

// ROI configurations from machineDetection.ts
const MACHINE_CONFIGS = [
  {
    agentId: 'Brandoa1',
    wsUrl: 'ws://100.107.170.119:3001',
    machines: [
      // Front camera - 4 washers
      { id: 'w1', label: 'W1', type: 'washer', camera: 'front',
        drum: { x: 0.019, y: 0.707, width: 0.141, height: 0.241 },
        display: { x: 0.000, y: 0.603, width: 0.080, height: 0.080 } },
      { id: 'w2', label: 'W2', type: 'washer', camera: 'front',
        drum: { x: 0.217, y: 0.541, width: 0.143, height: 0.262 },
        display: { x: 0.232, y: 0.411, width: 0.080, height: 0.080 } },
      { id: 'w3', label: 'W3', type: 'washer', camera: 'front',
        drum: { x: 0.394, y: 0.391, width: 0.131, height: 0.247 },
        display: { x: 0.420, y: 0.274, width: 0.080, height: 0.080 } },
      { id: 'w4', label: 'W4', type: 'washer', camera: 'front',
        drum: { x: 0.559, y: 0.275, width: 0.074, height: 0.226 },
        display: { x: 0.580, y: 0.168, width: 0.062, height: 0.065 } },
      // Back camera - 4 dryers
      { id: 'd5', label: 'D5', type: 'dryer', camera: 'back',
        drum: { x: 0.655, y: 0.141, width: 0.140, height: 0.287 },
        display: { x: 0.616, y: 0.392, width: 0.033, height: 0.054 } },
      { id: 'd6', label: 'D6', type: 'dryer', camera: 'back',
        drum: { x: 0.853, y: 0.239, width: 0.154, height: 0.370 },
        display: { x: 0.765, y: 0.493, width: 0.034, height: 0.064 } },
      { id: 'd7', label: 'D7', type: 'dryer', camera: 'back',
        drum: { x: 0.624, y: 0.563, width: 0.120, height: 0.280 },
        display: { x: 0.810, y: 0.529, width: 0.037, height: 0.066 } },
      { id: 'd8', label: 'D8', type: 'dryer', camera: 'back',
        drum: { x: 0.790, y: 0.750, width: 0.147, height: 0.228 },
        display: { x: 0.963, y: 0.656, width: 0.037, height: 0.075 } },
    ],
  },
  {
    agentId: 'Brandoa2',
    wsUrl: 'ws://100.126.119.4:3001',
    machines: [
      // Front camera - 4 washers
      { id: 'w1', label: 'W1', type: 'washer', camera: 'front',
        drum: { x: 0.522, y: 0.251, width: 0.049, height: 0.167 },
        display: { x: 0.526, y: 0.188, width: 0.046, height: 0.051 } },
      { id: 'w2', label: 'W2', type: 'washer', camera: 'front',
        drum: { x: 0.436, y: 0.324, width: 0.071, height: 0.210 },
        display: { x: 0.449, y: 0.233, width: 0.053, height: 0.053 } },
      { id: 'w3', label: 'W3', type: 'washer', camera: 'front',
        drum: { x: 0.324, y: 0.411, width: 0.097, height: 0.229 },
        display: { x: 0.344, y: 0.317, width: 0.037, height: 0.048 } },
      { id: 'w4', label: 'W4', type: 'washer', camera: 'front',
        drum: { x: 0.142, y: 0.557, width: 0.136, height: 0.275 },
        display: { x: 0.161, y: 0.449, width: 0.046, height: 0.053 } },
      // Back camera - 6 dryers
      { id: 'd1', label: 'D1', type: 'dryer', camera: 'back',
        drum: { x: 0.785, y: 0.607, width: 0.095, height: 0.213 },
        display: { x: 0.894, y: 0.536, width: 0.028, height: 0.064 } },
      { id: 'd2', label: 'D2', type: 'dryer', camera: 'back',
        drum: { x: 0.823, y: 0.252, width: 0.102, height: 0.234 },
        display: { x: 0.799, y: 0.444, width: 0.023, height: 0.054 } },
      { id: 'd3', label: 'D3', type: 'dryer', camera: 'back',
        drum: { x: 0.680, y: 0.495, width: 0.088, height: 0.179 },
        display: { x: 0.771, y: 0.420, width: 0.025, height: 0.053 } },
      { id: 'd4', label: 'D4', type: 'dryer', camera: 'back',
        drum: { x: 0.713, y: 0.185, width: 0.081, height: 0.194 },
        display: { x: 0.692, y: 0.355, width: 0.024, height: 0.050 } },
      { id: 'd5', label: 'D5', type: 'dryer', camera: 'back',
        drum: { x: 0.613, y: 0.403, width: 0.053, height: 0.187 },
        display: { x: 0.673, y: 0.334, width: 0.020, height: 0.048 } },
      { id: 'd6', label: 'D6', type: 'dryer', camera: 'back',
        drum: { x: 0.625, y: 0.127, width: 0.053, height: 0.176 },
        display: { x: 0.613, y: 0.289, width: 0.020, height: 0.041 } },
    ],
  },
];

async function captureFrame(wsUrl, camera, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let frameReceived = false;

    const timeoutId = setTimeout(() => {
      if (!frameReceived) {
        ws.close();
        reject(new Error(`Timeout waiting for frame from ${camera}`));
      }
    }, timeout);

    ws.on('open', () => {
      console.log(`Connected to ${wsUrl}, requesting ${camera} frame...`);
      ws.send(JSON.stringify({ type: 'subscribe', camera }));
    });

    ws.on('message', (data) => {
      try {
        // Check if it's a binary frame
        if (Buffer.isBuffer(data) && data.length > 1000) {
          frameReceived = true;
          clearTimeout(timeoutId);
          ws.close();
          resolve(data);
          return;
        }

        // Check for JSON message with frame
        const msg = JSON.parse(data.toString());
        if (msg.type === 'frame' && msg.data) {
          frameReceived = true;
          clearTimeout(timeoutId);
          ws.close();
          resolve(Buffer.from(msg.data, 'base64'));
        }
      } catch (e) {
        // Not JSON, might be binary frame
        if (data.length > 1000) {
          frameReceived = true;
          clearTimeout(timeoutId);
          ws.close();
          resolve(data);
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeoutId);
      if (!frameReceived) {
        reject(new Error('WebSocket closed without receiving frame'));
      }
    });
  });
}

async function drawROIs(imageBuffer, machines, width, height) {
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the original image
  ctx.drawImage(image, 0, 0);

  const imgWidth = image.width;
  const imgHeight = image.height;

  // Draw ROIs
  for (const machine of machines) {
    // Draw drum region (green)
    if (machine.drum) {
      const d = machine.drum;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        d.x * imgWidth,
        d.y * imgHeight,
        d.width * imgWidth,
        d.height * imgHeight
      );

      // Label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(d.x * imgWidth, d.y * imgHeight - 18, 50, 18);
      ctx.fillStyle = '#10b981';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${machine.label} D`, d.x * imgWidth + 4, d.y * imgHeight - 5);
    }

    // Draw display region (red)
    if (machine.display) {
      const s = machine.display;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        s.x * imgWidth,
        s.y * imgHeight,
        s.width * imgWidth,
        s.height * imgHeight
      );

      // Label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(s.x * imgWidth, s.y * imgHeight - 18, 50, 18);
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px sans-serif';
      ctx.fillText(`${machine.label} S`, s.x * imgWidth + 4, s.y * imgHeight - 5);
    }
  }

  return canvas.toBuffer('image/jpeg', { quality: 0.9 });
}

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const config of MACHINE_CONFIGS) {
    const agentName = config.agentId.toLowerCase();

    for (const camera of ['front', 'back']) {
      const machines = config.machines.filter(m => m.camera === camera);
      if (machines.length === 0) continue;

      console.log(`\nCapturing ${config.agentId} ${camera} camera...`);

      try {
        // Capture frame
        const frameData = await captureFrame(config.wsUrl, camera);

        // Save raw frame
        const rawPath = path.join(OUTPUT_DIR, `${agentName}_${camera}_raw.jpg`);
        fs.writeFileSync(rawPath, frameData);
        console.log(`  Saved raw frame: ${rawPath}`);

        // Draw ROIs and save
        const roiImage = await drawROIs(frameData, machines);
        const roiPath = path.join(OUTPUT_DIR, `${agentName}_${camera}_roi.jpg`);
        fs.writeFileSync(roiPath, roiImage);
        console.log(`  Saved ROI overlay: ${roiPath}`);

      } catch (err) {
        console.error(`  Error: ${err.message}`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
