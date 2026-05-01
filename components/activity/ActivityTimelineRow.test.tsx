// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityTimelineRow, type ActivityEvent } from './ActivityTimelineRow';

describe('<ActivityTimelineRow>', () => {
  it('renders a purchase event', () => {
    const event: ActivityEvent = { kind: 'purchase', date: '2026-04-14', title: 'Logged purchase', sub: 'qty 2 @ $54.97 · Walmart vending', amountCents: -10994 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('04-14')).toBeDefined();
    expect(screen.getByText('Logged purchase')).toBeDefined();
    expect(screen.getByText('P')).toBeDefined();
  });

  it('renders a sale event with positive amount', () => {
    const event: ActivityEvent = { kind: 'sale', date: '2026-04-25', title: 'Sold 1 — eBay', sub: '@ $89 net', amountCents: 6273 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('S')).toBeDefined();
    expect(screen.getByText(/\+\$62\.73/)).toBeDefined();
  });

  it('renders a rip event with negative locked loss', () => {
    const event: ActivityEvent = { kind: 'rip', date: '2026-04-02', title: 'Ripped 1 ETB → 9 packs', sub: 'snapshot loss locked', amountCents: -800 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('R')).toBeDefined();
  });

  it('renders a decomposition event with $0 muted', () => {
    const event: ActivityEvent = { kind: 'decomposition', date: '2026-03-28', title: 'Opened 1 — created 9 booster packs', sub: 'recipe', amountCents: 0 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('D')).toBeDefined();
    expect(screen.getByText('$0.00')).toBeDefined();
  });
});
