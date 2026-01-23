import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardView } from '../views/DashboardView';
import { Relay, CameraConfig } from '../../types';

describe('DashboardView', () => {
  const mockLaundry = {
    id: 'test-agent',
    name: 'Test Laundry',
    relays: [
      {
        id: 1,
        name: 'Test Relay',
        gpioPin: 5,
        type: 'LIGHT' as const,
        iconType: 'LIGHT' as const,
        isOn: false,
        isHidden: false,
        channelNumber: 1,
        colorGroup: 'blue' as const,
        agentId: 'test-agent',
      },
    ] as Relay[],
    isOnline: true,
    isMock: false,
    lastHeartbeat: Date.now(),
  };

  const mockProps = {
    laundries: [mockLaundry],
    isRelayEditMode: false,
    setIsRelayEditMode: vi.fn(),
    serverOnline: true,
    cameraError: null,
    showCameraLoading: false,
    relayEditAreaRef: { current: null },
    isLaundryOnline: vi.fn(() => true),
    getCameraSlots: vi.fn(() => []),
    handleBatchControl: vi.fn(),
    handleToggleRelay: vi.fn(),
    relayNameDrafts: {},
    relayDraftKey: vi.fn((agentId, relayId) => `${agentId}::${relayId}`),
    handleRelayNameInput: vi.fn(),
    handleRenameRelay: vi.fn(),
    handleToggleVisibility: vi.fn(),
    handleIconChange: vi.fn(),
    cameraDraftKey: vi.fn((agentId, cameraId) => `${agentId}::${cameraId}`),
    cameraNameDrafts: {},
    cameraSaving: {},
    cameraToggleLoading: {},
    cameraSaveErrors: {},
    cameraVisibility: {},
    isPageVisible: true,
    cameraFrameSources: {},
    buildCameraPreviewUrl: vi.fn(() => ''),
    cameraWarmup: {},
    CAMERA_WARMUP_MS: 15000,
    handleCameraNameInput: vi.fn(),
    handleCameraEnabledToggle: vi.fn(),
    handleCameraNameSave: vi.fn(),
    getCameraCardRef: vi.fn(() => () => {}),
    fetchLaundries: vi.fn(),
    machineStatus: {},
  };

  it('should render laundry name', () => {
    render(<DashboardView {...mockProps} />);
    expect(screen.getByText('Test Laundry')).toBeTruthy();
  });

  it('should render relay card', () => {
    render(<DashboardView {...mockProps} />);
    expect(screen.getByText('Test Relay')).toBeTruthy();
  });

  it('should show offline message when laundry is offline', () => {
    const offlineProps = {
      ...mockProps,
      laundries: [{ ...mockLaundry, isOnline: false }],
      isLaundryOnline: vi.fn(() => false),
    };
    render(<DashboardView {...offlineProps} />);
    expect(screen.getByText(/offline/i)).toBeTruthy();
  });

  it('should render empty state when no laundries', () => {
    const emptyProps = {
      ...mockProps,
      laundries: [],
    };
    render(<DashboardView {...emptyProps} />);
    // Should not crash and should show some message
    expect(screen.queryByText('Test Laundry')).toBeNull();
  });
});
