import { Relay, RelayType, Schedule } from './types';

export const INITIAL_RELAYS: Relay[] = [
  { id: 1, name: 'Main Hall Lights', gpioPin: 5, type: RelayType.LIGHT, iconType: RelayType.LIGHT, isOn: true, channelNumber: 1, isHidden: false, colorGroup: 'blue' },
  { id: 2, name: 'Rear Hall Lights', gpioPin: 6, type: RelayType.LIGHT, iconType: RelayType.LIGHT, isOn: true, channelNumber: 2, isHidden: false, colorGroup: 'blue' },
  { id: 3, name: 'Entrance Sign', gpioPin: 13, type: RelayType.SIGN, iconType: RelayType.SIGN, isOn: false, channelNumber: 3, isHidden: false, colorGroup: 'pink' },
  { id: 4, name: 'Window Neon', gpioPin: 16, type: RelayType.SIGN, iconType: RelayType.SIGN, isOn: false, channelNumber: 4, isHidden: false, colorGroup: 'pink' },
  { id: 5, name: 'Front Door Lock', gpioPin: 19, type: RelayType.DOOR, iconType: RelayType.DOOR, isOn: false, channelNumber: 5, isHidden: false, colorGroup: 'green' }, // OFF = Locked usually, depends on wiring
  { id: 6, name: 'Back Door Lock', gpioPin: 20, type: RelayType.DOOR, iconType: RelayType.DOOR, isOn: false, channelNumber: 6, isHidden: false, colorGroup: 'green' },
  { id: 7, name: 'Vending Machine', gpioPin: 12, type: RelayType.MACHINE, iconType: RelayType.MACHINE, isOn: true, channelNumber: undefined, isHidden: true, colorGroup: null }, // hide broken channel
  { id: 8, name: 'Office Fan', gpioPin: 26, type: RelayType.OTHER, iconType: RelayType.OTHER, isOn: false, channelNumber: 8, isHidden: false, colorGroup: 'orange' },
];

export const MOCK_SCHEDULES: Schedule[] = [
  {
    id: '1',
    relayIds: [1, 2, 3, 4],
    time: '06:00',
    action: 'ON',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    active: true,
  },
  {
    id: '2',
    relayIds: [5],
    time: '06:05',
    action: 'ON', // Unlock/Open
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    active: true,
  },
  {
    id: '3',
    relayIds: [1, 2, 3, 4, 5],
    time: '23:00',
    action: 'OFF',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    active: true,
  }
];

export const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
