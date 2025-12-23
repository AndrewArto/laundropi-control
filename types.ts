export enum RelayType {
  LIGHT = 'LIGHT',
  DOOR = 'DOOR',
  SIGN = 'SIGN',
  MACHINE = 'MACHINE',
  OTHER = 'OTHER'
}

export interface Relay {
  id: number;
  name: string;
  gpioPin: number;
  type: RelayType;
  isOn: boolean;
  isLocked?: boolean; // If true, cannot be manually toggled
  channelNumber?: number; // Physical channel label on the relay board
  isHidden?: boolean; // Hidden from dashboard when not editing
  iconType?: RelayType; // Which icon to render
  colorGroup?: 'blue' | 'green' | 'orange' | 'pink' | null;
}

export interface Schedule {
  id: string;
  relayIds: number[];
  time: string; // HH:mm format (24h)
  action: 'ON' | 'OFF';
  days: string[]; // ['Mon', 'Tue', ...]
  active: boolean;
}

export interface RelayGroup {
  id: string;
  name: string;
  relayIds: number[];
  onTime?: string | null;
  offTime?: string | null;
  days: string[];
  active: boolean;
}
