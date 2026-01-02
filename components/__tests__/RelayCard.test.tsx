import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RelayCard from '../RelayCard';
import { RelayType } from '../../types';

const baseRelay = {
  id: 1,
  name: 'Main Hall Lights',
  gpioPin: 1,
  type: RelayType.LIGHT,
  isOn: false,
};

describe('RelayCard', () => {
  it('calls onToggle when not editing', () => {
    const onToggle = vi.fn();
    render(<RelayCard relay={baseRelay as any} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('renders edit mode and saves name', () => {
    const onNameChange = vi.fn();
    const onNameSave = vi.fn();
    render(
      <RelayCard
        relay={baseRelay as any}
        onToggle={() => {}}
        isEditing
        nameValue="Draft"
        onNameChange={onNameChange}
        onNameSave={onNameSave}
      />
    );
    const input = screen.getByDisplayValue('Draft');
    fireEvent.change(input, { target: { value: 'New Name' } });
    expect(onNameChange).toHaveBeenCalledWith(1, 'New Name');
    fireEvent.blur(input);
    expect(onNameSave).toHaveBeenCalledWith(1);
  });

  it('hides toggle when disabled', () => {
    const onToggle = vi.fn();
    render(<RelayCard relay={{ ...baseRelay, isOn: true } as any} onToggle={onToggle} isDisabled />);
    const toggle = screen.getByRole('button');
    expect(toggle).toBeDisabled();
  });
});
