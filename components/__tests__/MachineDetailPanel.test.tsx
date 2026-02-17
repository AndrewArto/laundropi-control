import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MachineDetailPanel } from '../MachineDetailPanel';
import { LaundryMachine } from '../../types';

// Mock the ApiService
vi.mock('../../services/api', () => ({
  ApiService: {
    getMachineDetail: vi.fn(),
    sendMachineCommand: vi.fn(),
  },
}));

import { ApiService } from '../../services/api';

const mockedApi = vi.mocked(ApiService);

const baseMachine: LaundryMachine = {
  id: 'w1',
  label: 'Washer 1',
  type: 'washer',
  status: 'idle',
  lastUpdated: Date.now(),
  source: 'speedqueen',
  speedqueenId: 'mac_1096b5',
  remainingSeconds: 0,
  remainingVend: 0,
  isDoorOpen: false,
  selectedCycle: null,
  selectedModifier: null,
  model: 'SY80U',
};

describe('MachineDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getMachineDetail.mockResolvedValue({
      machine: baseMachine as any,
      cycles: [
        { id: 'cyc_normal', name: 'Normal', vendPrice: 350, duration: 1800 },
        { id: 'cyc_heavy', name: 'Heavy Duty', vendPrice: 450, duration: 2400 },
      ],
      locationId: 'loc_d23f6c',
      speedqueenId: 'mac_1096b5',
      model: 'SY80U',
    });
  });

  it('renders machine label and model', () => {
    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={baseMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );
    expect(screen.getByText('Washer 1')).toBeTruthy();
    expect(screen.getByText('(SY80U)')).toBeTruthy();
  });

  it('shows status indicator', () => {
    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={baseMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );
    expect(screen.getByText('idle')).toBeTruthy();
  });

  it('resets selectedCycleId when machine changes', async () => {
    const machine1 = { ...baseMachine, id: 'w1', label: 'Washer 1' };
    const machine2 = { ...baseMachine, id: 'w2', label: 'Washer 2', speedqueenId: 'mac_4a38fe' };

    // First call returns cycles for machine 1
    mockedApi.getMachineDetail.mockResolvedValueOnce({
      machine: machine1 as any,
      cycles: [{ id: 'cyc_m1', name: 'Cycle M1', vendPrice: 300, duration: 1200 }],
      locationId: 'loc_d23f6c',
      speedqueenId: 'mac_1096b5',
      model: 'SY80U',
    });

    const { rerender } = render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={machine1}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    await waitFor(() => {
      expect(mockedApi.getMachineDetail).toHaveBeenCalledWith('Brandoa1', 'w1');
    });

    // Second call returns cycles for machine 2
    mockedApi.getMachineDetail.mockResolvedValueOnce({
      machine: machine2 as any,
      cycles: [{ id: 'cyc_m2', name: 'Cycle M2', vendPrice: 400, duration: 1500 }],
      locationId: 'loc_d23f6c',
      speedqueenId: 'mac_4a38fe',
      model: 'SY105U',
    });

    // Switch to machine 2
    rerender(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={machine2}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    await waitFor(() => {
      expect(mockedApi.getMachineDetail).toHaveBeenCalledWith('Brandoa1', 'w2');
    });

    // The cycle dropdown should show machine 2's cycle, not machine 1's
    await waitFor(() => {
      expect(screen.getByText(/Cycle M2/)).toBeTruthy();
    });
  });

  it('sends set_out_of_order with outOfOrder=true when machine is not out_of_order', async () => {
    mockedApi.sendMachineCommand.mockResolvedValue({ ok: true, command: { id: 'cmd_1' } });

    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={baseMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    const btn = screen.getByText('Set Out of Order');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockedApi.sendMachineCommand).toHaveBeenCalledWith(
        'Brandoa1', 'w1', 'set_out_of_order', { outOfOrder: true },
      );
    });
  });

  it('sends set_out_of_order with outOfOrder=false when machine is out_of_order', async () => {
    mockedApi.sendMachineCommand.mockResolvedValue({ ok: true, command: { id: 'cmd_2' } });
    const oooMachine = { ...baseMachine, status: 'out_of_order' as const };

    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={oooMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    const btn = screen.getByText('Remove Out of Order');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockedApi.sendMachineCommand).toHaveBeenCalledWith(
        'Brandoa1', 'w1', 'set_out_of_order', { outOfOrder: false },
      );
    });
  });

  it('does not show action buttons for viewer role', () => {
    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={baseMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={true}
      />,
    );

    expect(screen.queryByText('Set Out of Order')).toBeNull();
    expect(screen.queryByText('Start Cycle')).toBeNull();
  });

  it('does not show SQ-specific details when isSpeedQueen is false', () => {
    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={baseMachine}
        onClose={vi.fn()}
        isSpeedQueen={false}
        isViewer={false}
      />,
    );

    expect(screen.queryByText(/Door:/)).toBeNull();
    expect(screen.queryByText('Set Out of Order')).toBeNull();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={baseMachine}
        onClose={onClose}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    // Click the backdrop (outermost div)
    const backdrop = screen.getByText('Washer 1').closest('.fixed');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows countdown timer for running machine', () => {
    const runningMachine = {
      ...baseMachine,
      status: 'running' as const,
      remainingSeconds: 125,
    };

    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={runningMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    expect(screen.getByText('2:05')).toBeTruthy();
  });

  it('shows error details when machine has error', () => {
    const errorMachine = {
      ...baseMachine,
      status: 'error' as const,
      errorName: 'Water Level Sensor',
      errorCode: 42,
      errorType: 'critical',
    };

    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={errorMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    expect(screen.getByText(/Water Level Sensor/)).toBeTruthy();
    expect(screen.getByText(/critical/)).toBeTruthy();
  });

  it('shows clear error button when machine has error', async () => {
    mockedApi.sendMachineCommand.mockResolvedValue({ ok: true, command: { id: 'cmd_3' } });
    const errorMachine = { ...baseMachine, status: 'error' as const, errorName: 'E1' };

    render(
      <MachineDetailPanel
        agentId="Brandoa1"
        machine={errorMachine}
        onClose={vi.fn()}
        isSpeedQueen={true}
        isViewer={false}
      />,
    );

    const btn = screen.getByText('Clear Error');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockedApi.sendMachineCommand).toHaveBeenCalledWith(
        'Brandoa1', 'w1', 'clear_error', undefined,
      );
    });
  });
});
