import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportsView } from '../views/ReportsView';
import type { MachineEvent } from '../views/ReportsView';

const mockAdminUser = {
  username: 'admin',
  role: 'admin' as const,
  lastLoginAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const mockLaundries = [
  { id: 'Brandoa1', name: 'Brandoa1', relays: [], isOnline: true, isMock: false, lastHeartbeat: Date.now() },
  { id: 'Brandoa2', name: 'Brandoa2', relays: [], isOnline: true, isMock: false, lastHeartbeat: Date.now() },
];

const mockEvents: MachineEvent[] = [
  {
    id: 1,
    timestamp: '2026-02-18T10:00:00.000Z',
    locationId: 'loc1',
    locationName: 'Brandoa1',
    machineId: 'sq-w1',
    localId: 'w1',
    agentId: 'Brandoa1',
    machineType: 'washer',
    statusId: 'IN_USE',
    previousStatusId: 'AVAILABLE',
    remainingSeconds: 1800,
    remainingVend: 350,
    isDoorOpen: 0,
    cycleId: 'cyc_medium',
    cycleName: 'MEDIUM',
    linkQuality: 78,
    receivedAt: '2026-02-18T10:00:01.000Z',
    source: 'ws_push',
    initiator: 'customer',
    initiatorUser: null,
    commandType: null,
  },
  {
    id: 2,
    timestamp: '2026-02-18T09:30:00.000Z',
    locationId: 'loc2',
    locationName: 'Brandoa2',
    machineId: 'sq-d3',
    localId: 'd3',
    agentId: 'Brandoa2',
    machineType: 'dryer',
    statusId: 'AVAILABLE',
    previousStatusId: 'END_OF_CYCLE',
    remainingSeconds: 0,
    remainingVend: null,
    isDoorOpen: 1,
    cycleId: null,
    cycleName: null,
    linkQuality: 44,
    receivedAt: '2026-02-18T09:30:01.000Z',
    source: 'rest_poll',
    initiator: 'admin',
    initiatorUser: 'admin',
    commandType: null,
  },
];

const createFetchMock = (data: MachineEvent[] = mockEvents, ok = true) => {
  return vi.fn(() => Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  }));
};

describe('ReportsView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should render Status Transitions header', async () => {
    globalThis.fetch = createFetchMock([]);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);
    expect(screen.getByText('Status Transitions')).toBeTruthy();
  });

  it('should show access restricted for non-admin/viewer users', () => {
    const regularUser = { ...mockAdminUser, role: 'user' as const };
    render(<ReportsView authUser={regularUser} laundries={mockLaundries} />);
    expect(screen.getByText(/Access restricted/)).toBeTruthy();
  });

  it('should allow viewer role access', async () => {
    globalThis.fetch = createFetchMock([]);
    const viewerUser = { ...mockAdminUser, role: 'viewer' as const };
    render(<ReportsView authUser={viewerUser} laundries={mockLaundries} />);
    expect(screen.getByText('Status Transitions')).toBeTruthy();
  });

  it('should render filter dropdowns', async () => {
    globalThis.fetch = createFetchMock([]);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);
    expect(screen.getByText('Location')).toBeTruthy();
    expect(screen.getByText('Machine')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('From')).toBeTruthy();
    expect(screen.getByText('To')).toBeTruthy();
  });

  it('should fetch and display events', async () => {
    globalThis.fetch = createFetchMock(mockEvents);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getAllByText('Brandoa1').length).toBeGreaterThan(0);
    });
    // w1 appears in filter dropdown + table + mobile card
    expect(screen.getAllByText('w1').length).toBeGreaterThan(1);
    expect(screen.getAllByText('IN_USE').length).toBeGreaterThan(0);
  });

  it('should display cycle price formatted as euros', async () => {
    globalThis.fetch = createFetchMock(mockEvents);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getAllByText('€3.50').length).toBeGreaterThan(0);
    });
  });

  it('should show door lock/unlock icons', async () => {
    globalThis.fetch = createFetchMock(mockEvents);
    const { container } = render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getByText('w1')).toBeTruthy();
    });

    // Lock icon for isDoorOpen=0, Unlock for isDoorOpen=1
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('should show source badges', async () => {
    globalThis.fetch = createFetchMock(mockEvents);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getAllByText('WS').length).toBeGreaterThan(0);
      expect(screen.getAllByText('REST').length).toBeGreaterThan(0);
    });
  });

  it('should show empty state when no events match', async () => {
    globalThis.fetch = createFetchMock([]);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getByText(/No events found/)).toBeTruthy();
    });
  });

  it('should show error state on fetch failure', async () => {
    globalThis.fetch = createFetchMock([], false);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeTruthy();
    });
  });

  it('should call fetch with correct params on filter change', async () => {
    const fetchMock = createFetchMock([]);
    globalThis.fetch = fetchMock;
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Change location filter
    const selects = screen.getAllByRole('combobox');
    const locationSelect = selects[0];
    fireEvent.change(locationSelect, { target: { value: 'Brandoa1' } });

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(lastCall[0]).toContain('agentId=Brandoa1');
    });
  });

  it('should show Load more button when there are more results', async () => {
    // Return PAGE_SIZE + 1 items to trigger "has more"
    const manyEvents = Array.from({ length: 201 }, (_, i) => ({
      ...mockEvents[0],
      id: i + 1,
    }));
    globalThis.fetch = createFetchMock(manyEvents);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getByText(/Load more/)).toBeTruthy();
    });
  });

  it('should format remaining seconds correctly', async () => {
    globalThis.fetch = createFetchMock(mockEvents);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      // 1800 seconds = 30:00
      expect(screen.getAllByText('30:00').length).toBeGreaterThan(0);
    });
  });

  it('should show transition count', async () => {
    globalThis.fetch = createFetchMock(mockEvents);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getByText('2 transitions shown')).toBeTruthy();
    });
  });

  it('should filter out initial snapshots by default', async () => {
    const eventsWithSnapshot: MachineEvent[] = [
      ...mockEvents,
      {
        id: 3,
        timestamp: '2026-02-18T08:00:00.000Z',
        locationId: 'loc1',
        locationName: 'Brandoa1',
        machineId: 'sq-w2',
        localId: 'w2',
        agentId: 'Brandoa1',
        machineType: 'washer',
        statusId: 'AVAILABLE',
        previousStatusId: null,
        remainingSeconds: null,
        remainingVend: null,
        isDoorOpen: null,
        cycleId: null,
        cycleName: null,
        linkQuality: null,
        receivedAt: null,
        source: 'rest_poll',
        initiator: null,
        initiatorUser: null,
        commandType: null,
      },
    ];
    globalThis.fetch = createFetchMock(eventsWithSnapshot);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      // Only 2 transitions shown (the initial snapshot is hidden)
      expect(screen.getByText(/2 transition/)).toBeTruthy();
      expect(screen.getByText(/1 initial snapshot hidden/)).toBeTruthy();
    });
  });

  it('should show initial snapshots when toggle is on', async () => {
    const eventsWithSnapshot: MachineEvent[] = [
      ...mockEvents,
      {
        id: 3,
        timestamp: '2026-02-18T08:00:00.000Z',
        locationId: 'loc1',
        locationName: 'Brandoa1',
        machineId: 'sq-w2',
        localId: 'w2',
        agentId: 'Brandoa1',
        machineType: 'washer',
        statusId: 'AVAILABLE',
        previousStatusId: null,
        remainingSeconds: null,
        remainingVend: null,
        isDoorOpen: null,
        cycleId: null,
        cycleName: null,
        linkQuality: null,
        receivedAt: null,
        source: 'rest_poll',
        initiator: null,
        initiatorUser: null,
        commandType: null,
      },
    ];
    globalThis.fetch = createFetchMock(eventsWithSnapshot);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);

    await waitFor(() => {
      expect(screen.getByText(/2 transition/)).toBeTruthy();
    });

    // Click the toggle button to show initial snapshots
    const toggleButton = screen.getByText('Transitions only');
    fireEvent.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByText('3 transitions shown')).toBeTruthy();
      expect(screen.getByText('All events')).toBeTruthy();
    });
  });

  it('should show transitions only toggle button', async () => {
    globalThis.fetch = createFetchMock([]);
    render(<ReportsView authUser={mockAdminUser} laundries={mockLaundries} />);
    expect(screen.getByText('Transitions only')).toBeTruthy();
  });
});
