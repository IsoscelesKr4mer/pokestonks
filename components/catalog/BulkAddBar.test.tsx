// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkAddBar } from './BulkAddBar';

describe('<BulkAddBar>', () => {
  it('renders count and primary action', () => {
    render(<BulkAddBar count={3} onClear={() => {}} onSubmit={() => {}} pending={false} />);
    expect(screen.getByText(/3 selected/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /add 3 to vault/i })).toBeDefined();
  });

  it('does not render when count is 0', () => {
    const { container } = render(<BulkAddBar count={0} onClear={() => {}} onSubmit={() => {}} pending={false} />);
    expect(container.textContent ?? '').toBe('');
  });

  it('calls onClear when "Clear" pressed', () => {
    const onClear = vi.fn();
    render(<BulkAddBar count={2} onClear={onClear} onSubmit={() => {}} pending={false} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('calls onSubmit when primary pressed', () => {
    const onSubmit = vi.fn();
    render(<BulkAddBar count={2} onClear={() => {}} onSubmit={onSubmit} pending={false} />);
    fireEvent.click(screen.getByRole('button', { name: /add 2 to vault/i }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('disables primary when pending', () => {
    render(<BulkAddBar count={2} onClear={() => {}} onSubmit={() => {}} pending />);
    const btn = screen.getByRole('button', { name: /adding/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
