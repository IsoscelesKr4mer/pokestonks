// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PnLDisplay } from './PnLDisplay';

describe('PnLDisplay', () => {
  it('renders positive P&L with + sign and green class', () => {
    const { container } = render(<PnLDisplay pnlCents={12345} pnlPct={12.3} />);
    expect(container.textContent).toContain('+$123.45');
    expect(container.textContent).toContain('+12.3%');
    expect(container.querySelector('[data-pnl-sign="positive"]')).not.toBeNull();
  });

  it('renders negative P&L with - sign and destructive class', () => {
    const { container } = render(<PnLDisplay pnlCents={-12345} pnlPct={-12.3} />);
    expect(container.textContent).toContain('-$123.45');
    expect(container.textContent).toContain('-12.3%');
    expect(container.querySelector('[data-pnl-sign="negative"]')).not.toBeNull();
  });

  it('renders zero P&L unsigned', () => {
    const { container } = render(<PnLDisplay pnlCents={0} pnlPct={0} />);
    expect(container.textContent).toContain('$0.00');
    expect(container.querySelector('[data-pnl-sign="zero"]')).not.toBeNull();
  });

  it('renders em-dash when pnlCents is null', () => {
    render(<PnLDisplay pnlCents={null} pnlPct={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('shows pct only when pnlPct is non-null', () => {
    const { container } = render(<PnLDisplay pnlCents={1000} pnlPct={null} />);
    expect(container.textContent).toContain('+$10.00');
    expect(container.textContent).not.toContain('%');
  });

  it('omits pct when showPct is false', () => {
    const { container } = render(<PnLDisplay pnlCents={1000} pnlPct={20} showPct={false} />);
    expect(container.textContent).toContain('+$10.00');
    expect(container.textContent).not.toContain('%');
  });
});
