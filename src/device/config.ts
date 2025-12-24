export type RelayConfig = {
  id: number;
  name: string;
  gpioPin: number;
  type: 'LIGHT' | 'DOOR' | 'SIGN' | 'MACHINE' | 'OTHER';
  iconType?: string;
  colorGroup?: 'blue' | 'green' | 'orange' | 'pink' | null;
  channelNumber?: number;
  isHidden?: boolean;
};

// Default wiring for Pi; override via env PIN_MAP (e.g., "1:5,2:6")
const DEFAULT_PIN_MAP: Record<number, number> = {
  1: 5,
  2: 6,
  3: 13,
  4: 16,
  5: 19,
  6: 20,
  7: 12,
  8: 26,
};

function buildPinMap(defaults: Record<number, number>) {
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
  return custom;
}

const PIN_MAP = buildPinMap(DEFAULT_PIN_MAP);

export const RELAYS_CONFIG: RelayConfig[] = [
  { id: 1, name: 'Main Hall Lights', gpioPin: PIN_MAP[1], type: 'LIGHT', iconType: 'LIGHT', colorGroup: 'blue', channelNumber: 1, isHidden: false },
  { id: 2, name: 'Rear Hall Lights', gpioPin: PIN_MAP[2], type: 'LIGHT', iconType: 'LIGHT', colorGroup: 'blue', channelNumber: 2, isHidden: false },
  { id: 3, name: 'Entrance Sign', gpioPin: PIN_MAP[3], type: 'SIGN', iconType: 'SIGN', colorGroup: 'pink', channelNumber: 3, isHidden: false },
  { id: 4, name: 'Window Neon', gpioPin: PIN_MAP[4], type: 'SIGN', iconType: 'SIGN', colorGroup: 'pink', channelNumber: 4, isHidden: false },
  { id: 5, name: 'Front Door Lock', gpioPin: PIN_MAP[5], type: 'DOOR', iconType: 'DOOR', colorGroup: 'green', channelNumber: 5, isHidden: false },
  { id: 6, name: 'Back Door Lock', gpioPin: PIN_MAP[6], type: 'DOOR', iconType: 'DOOR', colorGroup: 'green', channelNumber: 6, isHidden: false },
  { id: 7, name: 'Vending Machine', gpioPin: PIN_MAP[7], type: 'MACHINE', iconType: 'MACHINE', colorGroup: null, channelNumber: undefined, isHidden: true },
  { id: 8, name: 'Office Fan', gpioPin: PIN_MAP[8], type: 'OTHER', iconType: 'OTHER', colorGroup: 'orange', channelNumber: 8, isHidden: false },
];
