import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mocks = vi.hoisted(() => {
  const addGroup = vi.fn().mockResolvedValue({ id: '1', name: 'g', entries: [], days: [], active: false });
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
  const login = vi.fn();
  const logout = vi.fn();
  return { addGroup, getStatus, getSession, login, logout };
});

vi.mock('../../services/api', () => ({
  ApiService: {
    addGroup: mocks.addGroup,
    getStatus: mocks.getStatus,
    getSession: mocks.getSession,
    login: mocks.login,
    logout: mocks.logout,
  },
}));

// Render App directly; for the test we only check the form logic
import App from '../../App';

describe('Groups form validation', () => {
  beforeEach(() => {
    mocks.getSession.mockClear();
  });

  it('does not submit when group name is empty', async () => {
    render(<App />);
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
});
