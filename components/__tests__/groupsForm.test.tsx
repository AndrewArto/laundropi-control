import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mocks = vi.hoisted(() => {
  const addGroup = vi.fn().mockResolvedValue({ id: '1', name: 'g', entries: [], days: [], active: false });
  const updateGroup = vi.fn().mockResolvedValue({ id: '1', name: 'g', entries: [], days: [], active: false });
  const getStatus = vi.fn().mockImplementation(async () => {
    const payload = {
      relays: [{ id: 1, name: 'R1', gpioPin: 1, type: 'LIGHT', isOn: false }],
      schedules: [],
      groups: [],
      isMock: true,
      agentId: 'Brandoa_1',
      lastHeartbeat: Date.now(),
    };
    return payload;
  });
  const getSession = vi.fn().mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
  const listAgents = vi.fn().mockResolvedValue([
    { agentId: 'Brandoa_1', lastHeartbeat: Date.now(), online: true },
  ]);
  const getRevenueEntry = vi.fn().mockResolvedValue({ entry: null, audit: [] });
  const getRevenueSummary = vi.fn().mockResolvedValue({
    date: '2026-01-01',
    week: { startDate: '2026-01-01', endDate: '2026-01-07', totalsByAgent: {}, overall: 0 },
    month: { startDate: '2026-01-01', endDate: '2026-01-31', totalsByAgent: {}, overall: 0 },
  });
  const listRevenueEntryDates = vi.fn().mockResolvedValue([]);
  const login = vi.fn();
  const logout = vi.fn();
  return { addGroup, getStatus, getSession, listAgents, getRevenueEntry, getRevenueSummary, listRevenueEntryDates, login, logout };
});

vi.mock('../../services/api', () => ({
  ApiService: {
    addGroup: mocks.addGroup,
    updateGroup: mocks.updateGroup,
    getStatus: mocks.getStatus,
    getSession: mocks.getSession,
    listAgents: mocks.listAgents,
    getRevenueEntry: mocks.getRevenueEntry,
    getRevenueSummary: mocks.getRevenueSummary,
    listRevenueEntryDates: mocks.listRevenueEntryDates,
    login: mocks.login,
    logout: mocks.logout,
  },
}));

// Render App directly; for the test we only check the form logic
import App from '../../App';

describe('Groups form validation', () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ user: null });
    mocks.login.mockResolvedValue({ user: { username: 'admin', role: 'admin' } });
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
    mocks.updateGroup.mockResolvedValue({ id: '1', name: 'g', entries: [], days: [], active: false });
  });

  it('does not submit when group name is empty', async () => {
    render(<App />);
    const loginInput = await screen.findByPlaceholderText(/enter username/i);
    const passInput = await screen.findByPlaceholderText(/enter password/i);
    fireEvent.change(loginInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'password' } });
    fireEvent.click(screen.getByText(/sign in/i));

    const groupsTab = await screen.findByText(/Groups/i, undefined, { timeout: 5000 });
    fireEvent.click(groupsTab);

    const addBtn = await screen.findByRole('button', { name: /Add Group/i, timeout: 5000 });
    await waitFor(() => expect(addBtn).not.toBeDisabled(), { timeout: 5000 });
    fireEvent.click(addBtn);

    const nameInput = await screen.findByPlaceholderText(/Group name/i, undefined, { timeout: 2000 });
    fireEvent.change(nameInput, { target: { value: '' } });

    const saveBtn = screen.getByText(/Save Group/i);
    expect(saveBtn).toBeDisabled();
  });

  it('toggles schedule active checkbox', async () => {
    const group = {
      id: 'group-1',
      name: 'Morning',
      entries: [{ agentId: 'Brandoa_1', relayIds: [1] }],
      relayIds: [1],
      onTime: '07:00',
      offTime: '01:00',
      days: ['Mon'],
      active: false,
    };
    mocks.getStatus.mockResolvedValue({
      relays: [{ id: 1, name: 'R1', gpioPin: 1, type: 'LIGHT', isOn: false }],
      schedules: [],
      groups: [group],
      isMock: true,
      agentId: 'Brandoa_1',
      lastHeartbeat: Date.now(),
    });
    mocks.updateGroup.mockResolvedValue({ ...group, active: true });

    render(<App />);
    const loginInput = await screen.findByPlaceholderText(/enter username/i);
    const passInput = await screen.findByPlaceholderText(/enter password/i);
    fireEvent.change(loginInput, { target: { value: 'admin' } });
    fireEvent.change(passInput, { target: { value: 'password' } });
    fireEvent.click(screen.getByText(/sign in/i));

    const groupsTab = await screen.findByText(/Groups/i, undefined, { timeout: 5000 });
    fireEvent.click(groupsTab);

    const checkbox = await screen.findByLabelText(/Schedule active/i, undefined, { timeout: 5000 });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mocks.updateGroup).toHaveBeenCalled();
    });
    expect(mocks.updateGroup).toHaveBeenCalledWith(
      'Brandoa_1',
      'group-1',
      expect.objectContaining({ active: true })
    );
    await waitFor(() => expect(checkbox).toBeChecked());
  });
});
