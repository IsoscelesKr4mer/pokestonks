// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManualPriceBadge } from './ManualPriceBadge';

describe('<ManualPriceBadge>', () => {
  it('renders a "Manual" pill', () => {
    render(<ManualPriceBadge setAt={new Date('2026-04-15T12:00:00Z')} />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('exposes setAt date in title attribute', () => {
    render(<ManualPriceBadge setAt={new Date('2026-04-15T12:00:00Z')} />);
    const el = screen.getByText('Manual');
    expect(el.title).toMatch(/2026-04-15/);
  });

  it('accepts ISO string for setAt', () => {
    render(<ManualPriceBadge setAt="2026-04-20T08:00:00Z" />);
    expect(screen.getByText('Manual').title).toMatch(/2026-04-20/);
  });
});
