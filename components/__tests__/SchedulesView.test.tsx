import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchedulesView } from '../views/SchedulesView';

describe('SchedulesView', () => {
  const mockLaundry = {
    id: 'test-agent',
    name: 'Test Laundry',
    relays: [
      {
        id: 1,
        name: 'Main Hall Lights',
        gpioPin: 5,
        type: 'LIGHT' as const,
        iconType: 'LIGHT' as const,
        isOn: false,
        isHidden: false,
        channelNumber: 1,
        colorGroup: 'blue' as const,
        agentId: 'test-agent',
      },
      {
        id: 3,
        name: 'Entrance Sign',
        gpioPin: 13,
        type: 'SIGN' as const,
        iconType: 'SIGN' as const,
        isOn: false,
        isHidden: false,
        channelNumber: 3,
        colorGroup: 'pink' as const,
        agentId: 'test-agent',
      },
    ],
    isOnline: true,
    isMock: false,
    lastHeartbeat: Date.now(),
  };

  const mockGroup = {
    id: 'group-1',
    name: 'Morning Lights',
    onTime: '07:00',
    offTime: '01:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    active: true,
    entries: [
      {
        agentId: 'test-agent',
        relayIds: [1, 3],
      },
    ],
  };

  const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

  const mockProps = {
    laundries: [mockLaundry],
    newGroupSelections: [],
    newGroupName: '',
    newGroupOnTime: '',
    newGroupOffTime: '',
    newGroupDays: [],
    isNewGroupVisible: false,
    groups: [mockGroup],
    editingGroupId: null,
    controlsDisabled: false,
    groupSelectionTouched: false,
    serverOnline: true,
    DAYS_OF_WEEK,
    setNewGroupSelections: vi.fn(),
    setNewGroupName: vi.fn(),
    setNewGroupOnTime: vi.fn(),
    setNewGroupOffTime: vi.fn(),
    setNewGroupDays: vi.fn(),
    setIsNewGroupVisible: vi.fn(),
    setGroups: vi.fn(),
    setEditingGroupId: vi.fn(),
    isLaundryOnline: vi.fn(() => true),
    selectionKey: vi.fn((agentId, relayId) => `${agentId}::${relayId}`),
    dedupeSelections: vi.fn((items) => items),
    normalizeTimeInput: vi.fn((val) => val),
    to24h: vi.fn((val) => val),
    handleCreateGroup: vi.fn(),
    handleUpdateGroup: vi.fn(),
    handleDeleteGroup: vi.fn(),
    handleToggleGroupPower: vi.fn(),
  };

  it('should render schedule header', () => {
    render(<SchedulesView {...mockProps} />);
    expect(screen.getByText('Groups & Schedules')).toBeTruthy();
  });

  it('should render group with relay tiles', () => {
    render(<SchedulesView {...mockProps} />);

    // Check group name is rendered
    expect(screen.getByText('Morning Lights')).toBeTruthy();

    // Check relay tiles are rendered
    expect(screen.getByText('Main Hall Lights')).toBeTruthy();
    expect(screen.getByText('Entrance Sign')).toBeTruthy();

    // Check relay IDs are shown
    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#3')).toBeTruthy();
  });

  it('should show schedule fields when editing', () => {
    const editingProps = {
      ...mockProps,
      editingGroupId: 'group-1',
    };
    render(<SchedulesView {...editingProps} />);

    // Check that time inputs are visible
    const onTimeInputs = screen.getAllByDisplayValue('07:00');
    expect(onTimeInputs.length).toBeGreaterThan(0);

    const offTimeInputs = screen.getAllByDisplayValue('01:00');
    expect(offTimeInputs.length).toBeGreaterThan(0);
  });

  it('should render empty state when no groups', () => {
    const emptyProps = {
      ...mockProps,
      groups: [],
    };
    render(<SchedulesView {...emptyProps} />);
    expect(screen.getByText(/No groups yet/i)).toBeTruthy();
  });

  it('should show agent name for relay groups', () => {
    render(<SchedulesView {...mockProps} />);
    expect(screen.getByText('Test Laundry')).toBeTruthy();
  });
});
