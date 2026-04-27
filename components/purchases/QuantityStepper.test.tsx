// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantityStepper } from './QuantityStepper';

describe('<QuantityStepper>', () => {
  it('renders the current value', () => {
    render(<QuantityStepper value={3} onChange={() => {}} />);
    expect(screen.getByLabelText('Quantity')).toHaveTextContent('3');
  });

  it('increments via the + button', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /increase/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('decrements via the − button', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /decrease/i }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('disables − at min (default 1)', () => {
    render(<QuantityStepper value={1} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
  });

  it('respects custom min', () => {
    render(<QuantityStepper value={3} min={3} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
  });

  it('disables + at max', () => {
    render(<QuantityStepper value={5} max={5} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /increase/i })).toBeDisabled();
  });
});
