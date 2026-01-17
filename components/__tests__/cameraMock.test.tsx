import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mocks = vi.hoisted(() => {
  let cameraEnabled = false;
  const cameraId = 'Brandoa_1:front';
  const cameraPayload = () => ({
    id: cameraId,
    agentId: 'Brandoa_1',
    name: 'Front',
    position: 'front',
    sourceType: 'pattern',
    rtspUrl: null,
    enabled: cameraEnabled,
    hasCredentials: false,
    previewUrl: `/api/agents/Brandoa_1/cameras/${encodeURIComponent(cameraId)}/frame`,
  });
  const addGroup = vi.fn().mockResolvedValue({ id: '1', name: 'g', entries: [], days: [], active: false });
  const updateGroup = vi.fn().mockResolvedValue({ id: '1', name: 'g', entries: [], days: [], active: false });
  const getStatus = vi.fn().mockResolvedValue({
    relays: [{ id: 1, name: 'R1', gpioPin: 1, type: 'LIGHT', isOn: false }],
    schedules: [],
    groups: [],
    isMock: true,
    agentId: 'Brandoa_1',
    lastHeartbeat: Date.now(),
  });
  const getSession = vi.fn().mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  const listAgents = vi.fn().mockResolvedValue([
    { agentId: 'Brandoa_1', lastHeartbeat: Date.now(), online: true },
  ]);
  const listCameras = vi.fn().mockImplementation(async () => ({ cameras: [cameraPayload()] }));
  const updateCamera = vi.fn().mockImplementation(async (_agentId: string, _cameraId: string, payload: any) => {
    if (typeof payload.enabled === 'boolean') {
      cameraEnabled = payload.enabled;
    }
    return { camera: cameraPayload() };
  });
  const buildCameraPayload = () => cameraPayload();
  const setCameraEnabled = (value: boolean) => {
    cameraEnabled = value;
  };
  const getRevenueEntry = vi.fn().mockResolvedValue({ entry: null, audit: [] });
  const getRevenueSummary = vi.fn().mockResolvedValue({
    date: '2026-01-01',
    week: { startDate: '2026-01-01', endDate: '2026-01-07', totalsByAgent: {}, overall: 0 },
    month: { startDate: '2026-01-01', endDate: '2026-01-31', totalsByAgent: {}, overall: 0 },
  });
  const listRevenueEntryDates = vi.fn().mockResolvedValue([]);
  const listRevenueEntries = vi.fn().mockResolvedValue([]);
  const login = vi.fn().mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  const logout = vi.fn();
  const setRelayState = vi.fn();
  const batchControl = vi.fn();
  const renameRelay = vi.fn();
  const setRelayVisibility = vi.fn();
  const setRelayIcon = vi.fn();
  const addRevenue = vi.fn();
  const saveRevenueEntry = vi.fn();
  const listUsers = vi.fn().mockResolvedValue([]);
  const createUser = vi.fn();
  const updateUserRole = vi.fn();
  const updateUserPassword = vi.fn();
  const addLaundry = vi.fn();
  const updateLaundry = vi.fn();
  const deleteLaundry = vi.fn();
  const toggleGroup = vi.fn();
  return {
    addGroup,
    updateGroup,
    getStatus,
    getSession,
    listAgents,
    listCameras,
    updateCamera,
    buildCameraPayload,
    setCameraEnabled,
    getRevenueEntry,
    getRevenueSummary,
    listRevenueEntryDates,
    listRevenueEntries,
    login,
    logout,
    setRelayState,
    batchControl,
    renameRelay,
    setRelayVisibility,
    setRelayIcon,
    addRevenue,
    saveRevenueEntry,
    listUsers,
    createUser,
    updateUserRole,
    updateUserPassword,
    addLaundry,
    updateLaundry,
    deleteLaundry,
    toggleGroup,
  };
});

vi.mock('../../services/api', () => ({
  ApiService: {
    addGroup: mocks.addGroup,
    updateGroup: mocks.updateGroup,
    getStatus: mocks.getStatus,
    getSession: mocks.getSession,
    listAgents: mocks.listAgents,
    listCameras: mocks.listCameras,
    updateCamera: mocks.updateCamera,
    getRevenueEntry: mocks.getRevenueEntry,
    getRevenueSummary: mocks.getRevenueSummary,
    listRevenueEntryDates: mocks.listRevenueEntryDates,
    listRevenueEntries: mocks.listRevenueEntries,
    login: mocks.login,
    logout: mocks.logout,
    setRelayState: mocks.setRelayState,
    batchControl: mocks.batchControl,
    renameRelay: mocks.renameRelay,
    setRelayVisibility: mocks.setRelayVisibility,
    setRelayIcon: mocks.setRelayIcon,
    addRevenue: mocks.addRevenue,
    saveRevenueEntry: mocks.saveRevenueEntry,
    listUsers: mocks.listUsers,
    createUser: mocks.createUser,
    updateUserRole: mocks.updateUserRole,
    updateUserPassword: mocks.updateUserPassword,
    addLaundry: mocks.addLaundry,
    updateLaundry: mocks.updateLaundry,
    deleteLaundry: mocks.deleteLaundry,
    toggleGroup: mocks.toggleGroup,
  },
  resolveBaseUrl: () => '',
}));

import App from '../../App';

describe('Mock camera previews', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: null });
    mocks.login.mockResolvedValue({ user: { username: 'admin', role: 'user' } });
    mocks.setCameraEnabled(false);
    mocks.listCameras.mockImplementation(async () => ({ cameras: [mocks.buildCameraPayload()] }));
    mocks.updateCamera.mockImplementation(async (_agentId: string, _cameraId: string, payload: any) => {
      if (typeof payload.enabled === 'boolean') {
        mocks.setCameraEnabled(payload.enabled);
      }
      return { camera: mocks.buildCameraPayload() };
    });
    mocks.listAgents.mockResolvedValue([
      { agentId: 'Brandoa_1', lastHeartbeat: Date.now(), online: true },
    ]);
    mocks.getStatus.mockResolvedValue({
      relays: [{ id: 1, name: 'R1', gpioPin: 1, type: 'LIGHT', isOn: false }],
      schedules: [],
      groups: [],
      isMock: true,
      agentId: 'Brandoa_1',
      lastHeartbeat: Date.now(),
    });
  });

  it('shows pattern preview after enabling a mock camera', async () => {
    render(<App />);
    const loginInput = await screen.findByPlaceholderText(/enter username/i);
    const passInput = await screen.findByPlaceholderText(/enter password/i);
    fireEvent.change(loginInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'password' } });
    fireEvent.click(screen.getByText(/sign in/i));

    await screen.findByText(/cameras/i, undefined, { timeout: 5000 });
    const enableButtons = await screen.findAllByRole('button', { name: /enable camera/i }, { timeout: 5000 });
    expect(screen.queryByAltText(/front feed/i)).toBeNull();
    fireEvent.click(enableButtons[0]);

    await waitFor(() => expect(mocks.updateCamera).toHaveBeenCalled());
    const preview = await screen.findByAltText(/front feed/i, undefined, { timeout: 5000 });
    expect(preview).toBeInTheDocument();
    expect(screen.getAllByText(/^mock$/i).length).toBeGreaterThan(0);
  });
});
