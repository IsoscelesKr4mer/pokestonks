// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoBasisPill } from './NoBasisPill';

describe('NoBasisPill', () => {
  it('renders the "No basis" label', () => {
    render(<NoBasisPill />);
    expect(screen.getByText('No basis')).toBeTruthy();
  });

  it('exposes an aria-label for screen readers', () => {
    render(<NoBasisPill />);
    const el = screen.getByLabelText(/no basis/i);
    expect(el).toBeTruthy();
  });

  it('forwards a className', () => {
    render(<NoBasisPill className="ml-2" />);
    const el = screen.getByText('No basis');
    expect(el.className).toContain('ml-2');
  });
});
