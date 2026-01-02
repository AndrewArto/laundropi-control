
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// --- CONFIGURATION ---
const PORT = 3001;
const DATA_FILE = path.join(__dirname, 'data.json');
const ACTIVE_LOW = true; // Relay board uses low-level trigger: 0 = ON, 1 = OFF
// Default map adjusted to observed wiring: UI 4->pin16, 5->19, 6->20, 7->12, 8->26
const DEFAULT_PIN_MAP = {
  1: 5,
  2: 6,
  3: 13,
  4: 16,
  5: 19,
  6: 20,
  7: 12,
  8: 26,
};
const HAS_PIN_MAP_OVERRIDE = Boolean(process.env.PIN_MAP);
const PIN_MAP = buildPinMap(DEFAULT_PIN_MAP);
const LEGACY_PIN_SET = [17, 27, 22, 10, 9, 11, 5, 6]; // Previous defaults
const CHANNEL_MAP = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: undefined,
  8: 8,
};
const COLOR_GROUPS = ['blue','green','orange','pink'];

// --- HARDWARE ABSTRACTION LAYER ---
// Raspberry Pi 5 uses the RP1 chip; we use pinctrl/raspi-gpio for direct control.

class MockGpio {
  constructor(pin) { this.pin = pin; this.val = 0; console.log(`[Mock] Pin ${pin} Init`); }
  writeSync(val) { this.val = val; console.log(`[Mock] Pin ${this.pin} -> ${val}`); }
}

class ShellGpio {
  constructor(pin) {
    this.pin = pin;
    // Attempt to initialize pin as Output using Pi 5 'pinctrl' or older 'raspi-gpio'
    try {
      // Pi 5 Standard
      execSync(`pinctrl set ${pin} op`, { stdio: 'ignore' });
    } catch (e) {
      try {
        // Pi 4 / Legacy
        execSync(`raspi-gpio set ${pin} op`, { stdio: 'ignore' });
      } catch (e2) {
        // Silent fail on init, writeSync will scream if it fails
      }
    }
  }

  writeSync(val) {
    const level = val ? 'dh' : 'dl'; // 'dh' = drive high, 'dl' = drive low
    try {
      // Pi 5 Standard
      execSync(`pinctrl set ${this.pin} ${level}`, { stdio: 'ignore' });
    } catch (e) {
      try {
        // Pi 4 / Legacy
        execSync(`raspi-gpio set ${this.pin} ${level}`, { stdio: 'ignore' });
      } catch (e2) {
        console.error(`[ShellGpio] Failed to write to pin ${this.pin}. Ensure pinctrl or raspi-gpio is installed.`);
      }
    }
  }
}

// Factory to get the working GPIO controller
function createGpio(pin) {
  const forceMock = process.env.MOCK_GPIO === '1' || process.env.MOCK_GPIO === 'true';
  if (forceMock || os.platform() !== 'linux') return new MockGpio(pin);
  return new ShellGpio(pin);
}

// --- DEFAULT STATE ---
const INITIAL_RELAYS = [
  { id: 1, name: 'Main Hall Lights', gpioPin: PIN_MAP[1], type: 'LIGHT', iconType: 'LIGHT', colorGroup: 'blue', isOn: true, channelNumber: 1, isHidden: false },
  { id: 2, name: 'Rear Hall Lights', gpioPin: PIN_MAP[2], type: 'LIGHT', iconType: 'LIGHT', colorGroup: 'blue', isOn: true, channelNumber: 2, isHidden: false },
  { id: 3, name: 'Entrance Sign', gpioPin: PIN_MAP[3], type: 'SIGN', iconType: 'SIGN', colorGroup: 'pink', isOn: false, channelNumber: 3, isHidden: false },
  { id: 4, name: 'Window Neon', gpioPin: PIN_MAP[4], type: 'SIGN', iconType: 'SIGN', colorGroup: 'pink', isOn: false, channelNumber: 4, isHidden: false },
  { id: 5, name: 'Front Door Lock', gpioPin: PIN_MAP[5], type: 'DOOR', iconType: 'DOOR', colorGroup: 'green', isOn: false, channelNumber: 5, isHidden: false },
  { id: 6, name: 'Back Door Lock', gpioPin: PIN_MAP[6], type: 'DOOR', iconType: 'DOOR', colorGroup: 'green', isOn: false, channelNumber: 6, isHidden: false },
  { id: 7, name: 'Vending Machine', gpioPin: PIN_MAP[7], type: 'MACHINE', iconType: 'MACHINE', colorGroup: null, isOn: true, channelNumber: undefined, isHidden: true },
  { id: 8, name: 'Office Fan', gpioPin: PIN_MAP[8], type: 'OTHER', iconType: 'OTHER', colorGroup: 'orange', isOn: false, channelNumber: 8, isHidden: false },
];

// --- APP STATE ---
let state = {
  relays: [...INITIAL_RELAYS],
  schedules: [],
  groups: []
};

// --- HARDWARE INIT ---
const activePins = {};

function initHardware() {
  state.relays.forEach(relay => {
    if (!activePins[relay.id]) {
      activePins[relay.id] = createGpio(relay.gpioPin);
      // Restore state
      if (activePins[relay.id]) {
         writeToPin(activePins[relay.id], relay.isOn, relay);
      }
    }
  });
}

function updateHardware(relayId, isOn) {
  let pinObj = activePins[relayId];
  const relay = state.relays.find(r => r.id === relayId);

  // Lazily (re)create pin object if missing
  if (!pinObj && relay) {
    activePins[relayId] = createGpio(relay.gpioPin);
    pinObj = activePins[relayId];
  }

  if (pinObj && relay) {
    writeToPin(pinObj, isOn, relay);
  }
}

function writeToPin(pinObj, isOn, relayMeta) {
  // Active-low relay boards treat 0 as ON and 1 as OFF.
  const level = ACTIVE_LOW ? (isOn ? 0 : 1) : (isOn ? 1 : 0);
  if (relayMeta) {
    console.log(`[Hardware] Relay ${relayMeta.name} (id=${relayMeta.id}) -> pin ${relayMeta.gpioPin}, ` +
      `${isOn ? 'ON' : 'OFF'} (write ${level}).`);
  }
  pinObj.writeSync(level);
}

function buildPinMap(defaults) {
  const envMap = process.env.PIN_MAP;
  if (!envMap) return defaults;

  const custom = { ...defaults };
  envMap.split(',').forEach(pair => {
    const [relayIdStr, pinStr] = pair.split(':').map(x => x.trim());
    const relayId = parseInt(relayIdStr, 10);
    const pin = parseInt(pinStr, 10);
    if (Number.isInteger(relayId) && Number.isInteger(pin)) {
      custom[relayId] = pin;
    }
  });
  console.log(`[Config] Using PIN_MAP override: ${JSON.stringify(custom)}`);
  return custom;
}

function migrateLegacyPins() {
  // Detect legacy pin layout or stale map and remap to current defaults/overrides
  const currentPins = state.relays.map(r => r.gpioPin);
  const looksLegacy = LEGACY_PIN_SET.some(pin => currentPins.includes(pin));
  const differsFromCurrent = state.relays.some(relay => relay.gpioPin !== (PIN_MAP[relay.id] || relay.gpioPin));

  if (looksLegacy || HAS_PIN_MAP_OVERRIDE || differsFromCurrent) {
    state.relays = state.relays.map(relay => ({
      ...relay,
      gpioPin: PIN_MAP[relay.id] || relay.gpioPin
    }));
    const reason = looksLegacy
      ? 'Migrated legacy GPIO map'
      : HAS_PIN_MAP_OVERRIDE
        ? 'Applied PIN_MAP override'
        : 'Normalized to current default PIN_MAP';
    console.log(`[Data] ${reason} to: ${JSON.stringify(PIN_MAP)}.`);
  }
}

function applyChannelLabels() {
  state.relays = state.relays.map(relay => ({
    ...relay,
    channelNumber: typeof relay.channelNumber === 'number' ? relay.channelNumber : CHANNEL_MAP[relay.id]
  }));
}

function applyHiddenDefaults() {
  state.relays = state.relays.map(relay => ({
    ...relay,
    isHidden: typeof relay.isHidden === 'boolean' ? relay.isHidden : false
  }));
}

function applyIconDefaults() {
  state.relays = state.relays.map(relay => ({
    ...relay,
    iconType: relay.iconType || relay.type || 'OTHER'
  }));
}

function applyColorGroupDefaults() {
  state.relays = state.relays.map(relay => ({
    ...relay,
    colorGroup: typeof relay.colorGroup === 'string' && COLOR_GROUPS.includes(relay.colorGroup) ? relay.colorGroup : (relay.colorGroup === null ? null : null)
  }));
}

function pruneHiddenFromSchedules() {
  const hiddenIds = new Set(state.relays.filter(r => r.isHidden).map(r => r.id));
  state.schedules = state.schedules.map(s => ({
    ...s,
    relayIds: (s.relayIds || []).filter(id => !hiddenIds.has(id))
  }));
}

// --- PERSISTENCE ---
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const saved = JSON.parse(raw);
      state.relays = saved.relays || INITIAL_RELAYS;
      state.schedules = saved.schedules || [];
      state.groups = saved.groups || [];
      console.log("Data loaded from disk.");
    } catch (e) {
      console.error("Failed to parse data file, using defaults.");
    }
  }
  migrateLegacyPins();
  applyChannelLabels();
  applyHiddenDefaults();
  applyIconDefaults();
  applyColorGroupDefaults();
  pruneHiddenFromSchedules();
  initHardware();
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save data:", e);
  }
}

// --- UTILS ---
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if ('IPv4' !== iface.family || iface.internal) continue;
      return iface.address;
    }
  }
  return 'localhost';
}

// --- SERVER SETUP ---
const app = express();
app.use(cors());
app.use(express.json());

// --- ROUTES ---
app.get('/api/status', (req, res) => {
  const hasShellGpio = fs.existsSync('/usr/bin/pinctrl') || fs.existsSync('/usr/bin/raspi-gpio');
  const isHardware = os.platform() === 'linux' && (!!GpioLib || hasShellGpio);
  res.json({ ...state, isHardware });
});

app.post('/api/relays/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const relay = state.relays.find(r => r.id === id);
  if (relay) {
    const targetState = !relay.isOn;
    relay.isOn = targetState;
    updateHardware(relay.id, targetState);
    saveData();
    res.json({ relays: state.relays });
    console.log(`Relay ${relay.name} toggled ${targetState ? 'ON' : 'OFF'}`);
  } else {
    res.status(404).json({ error: "Relay not found" });
  }
});

app.put('/api/relays/:id/name', (req, res) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;
  const relay = state.relays.find(r => r.id === id);
  if (!relay) return res.status(404).json({ error: 'Relay not found' });
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Invalid name' });
  }

  relay.name = name.trim();
  saveData();
  res.json(relay);
  console.log(`Relay ${relay.id} renamed to "${relay.name}"`);
});

app.put('/api/relays/:id/visibility', (req, res) => {
  const id = parseInt(req.params.id);
  const { isHidden } = req.body;
  const relay = state.relays.find(r => r.id === id);
  if (!relay) return res.status(404).json({ error: 'Relay not found' });
  if (typeof isHidden !== 'boolean') {
    return res.status(400).json({ error: 'Invalid visibility flag' });
  }

  relay.isHidden = isHidden;
  if (isHidden) {
    pruneHiddenFromSchedules();
  }
  saveData();
  res.json(relay);
  console.log(`Relay ${relay.id} visibility set to ${isHidden ? 'hidden' : 'visible'}`);
});

app.put('/api/relays/:id/icon', (req, res) => {
  const id = parseInt(req.params.id);
  const { iconType } = req.body;
  const relay = state.relays.find(r => r.id === id);
  if (!relay) return res.status(404).json({ error: 'Relay not found' });
  const validIcons = ['LIGHT','DOOR','SIGN','MACHINE','OTHER'];
  if (!validIcons.includes(iconType)) return res.status(400).json({ error: 'Invalid icon' });
  relay.iconType = iconType;
  saveData();
  res.json(relay);
  console.log(`Relay ${relay.id} icon set to ${iconType}`);
});

app.put('/api/relays/:id/group', (req, res) => {
  const id = parseInt(req.params.id);
  const { colorGroup } = req.body;
  const relay = state.relays.find(r => r.id === id);
  if (!relay) return res.status(404).json({ error: 'Relay not found' });
  if (colorGroup !== null && !COLOR_GROUPS.includes(colorGroup)) {
    return res.status(400).json({ error: 'Invalid color group' });
  }
  relay.colorGroup = colorGroup;
  saveData();
  res.json(relay);
  console.log(`Relay ${relay.id} color group set to ${colorGroup}`);
});

app.post('/api/relays/batch', (req, res) => {
  const { ids, action } = req.body;
  const targetState = action === 'ON';
  state.relays.forEach(relay => {
    if (ids.includes(relay.id) && !relay.isHidden) {
      relay.isOn = targetState;
      updateHardware(relay.id, targetState);
    }
  });
  saveData();
  res.json({ success: true });
});

// --- GROUPS ---
function normalizeGroupPayload(body) {
  return {
    name: (body.name || 'Group').toString(),
    relayIds: Array.isArray(body.relayIds) ? body.relayIds.filter(id => Number.isInteger(id)) : [],
    onTime: body.onTime || null,
    offTime: body.offTime || null,
    days: Array.isArray(body.days) ? body.days : [],
    active: typeof body.active === 'boolean' ? body.active : true
  };
}

app.post('/api/groups', (req, res) => {
  const payload = normalizeGroupPayload(req.body);
  const newGroup = { ...payload, id: Date.now().toString() };
  state.groups.push(newGroup);
  saveData();
  res.json(newGroup);
});

app.put('/api/groups/:id', (req, res) => {
  const { id } = req.params;
  const idx = state.groups.findIndex(g => g.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Group not found' });
  const payload = normalizeGroupPayload(req.body);
  state.groups[idx] = { ...state.groups[idx], ...payload, id };
  saveData();
  res.json(state.groups[idx]);
});

app.delete('/api/groups/:id', (req, res) => {
  const { id } = req.params;
  state.groups = state.groups.filter(g => g.id !== id);
  saveData();
  res.json({ success: true });
});

app.post('/api/groups/:id/action', (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  const group = state.groups.find(g => g.id === id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const targetState = action === 'ON';
  state.relays.forEach(relay => {
    if (group.relayIds.includes(relay.id) && !relay.isHidden) {
      relay.isOn = targetState;
      updateHardware(relay.id, targetState);
    }
  });
  saveData();
  res.json({ relays: state.relays });
});

app.post('/api/schedules', (req, res) => {
  const newSchedule = { ...req.body, id: Date.now().toString() };
  state.schedules.push(newSchedule);
  saveData();
  res.json(newSchedule);
});

app.put('/api/schedules/:id', (req, res) => {
  const id = req.params.id;
  const idx = state.schedules.findIndex(s => s.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Schedule not found' });
  }
  state.schedules[idx] = { ...req.body, id };
  saveData();
  res.json(state.schedules[idx]);
});

app.delete('/api/schedules/:id', (req, res) => {
  state.schedules = state.schedules.filter(s => s.id !== req.params.id);
  saveData();
  res.json({ success: true });
});

// --- STATIC FRONTEND (production build) ---
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// --- SCHEDULER LOOP ---
setInterval(() => {
  const now = new Date();
  const currentDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayName = currentDays[now.getDay()];
  const currentTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  state.schedules.forEach(schedule => {
    if (!schedule.active || !schedule.days.includes(todayName)) return;

    if (schedule.time === currentTimeStr) {
      const targetState = schedule.action === 'ON';
      let triggered = false;
      state.relays.forEach(relay => {
        if (schedule.relayIds.includes(relay.id) && relay.isOn !== targetState) {
             relay.isOn = targetState;
             updateHardware(relay.id, targetState);
             triggered = true;
        }
      });
      if (triggered) {
        console.log(`[Auto] Schedule ${schedule.id} executed: Turning ${schedule.action}`);
        saveData();
      }
    }
  });

  // Group schedules (on/off times)
  state.groups.forEach(group => {
    if (!group.active || !(group.days || []).includes(todayName)) return;
    if (group.onTime && group.onTime === currentTimeStr) {
      const targetState = true;
      let triggered = false;
      state.relays.forEach(relay => {
        if (group.relayIds.includes(relay.id) && relay.isOn !== targetState) {
             relay.isOn = targetState;
             updateHardware(relay.id, targetState);
             triggered = true;
        }
      });
      if (triggered) {
        console.log(`[Auto] Group ${group.id} ON executed`);
        saveData();
      }
    }
    if (group.offTime && group.offTime === currentTimeStr) {
      const targetState = false;
      let triggered = false;
      state.relays.forEach(relay => {
        if (group.relayIds.includes(relay.id) && relay.isOn !== targetState) {
             relay.isOn = targetState;
             updateHardware(relay.id, targetState);
             triggered = true;
        }
      });
      if (triggered) {
        console.log(`[Auto] Group ${group.id} OFF executed`);
        saveData();
      }
    }
  });
}, 1000);

// --- START ---
loadData();
const ip = getLocalIp();
app.listen(PORT, '0.0.0.0', () => {
  console.log('--------------------------------------------------');
  console.log(`LaundroPi Server (Pi 5 Compatible) running!`);
  console.log(`Local Address:   http://localhost:${PORT}`);
  console.log(`Network Address: http://${ip}:${PORT}`);
  console.log('--------------------------------------------------');
});
