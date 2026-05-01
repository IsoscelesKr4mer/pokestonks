// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoldingThumbnail } from './HoldingThumbnail';

describe('<HoldingThumbnail>', () => {
  const baseProps = {
    name: 'SV 151 ETB',
    kind: 'sealed' as const,
    imageUrl: 'https://example.com/etb.png',
    imageStoragePath: null,
  };

  it('renders the image with alt text', () => {
    render(<HoldingThumbnail {...baseProps} />);
    expect(screen.getByAltText('SV 151 ETB')).toBeDefined();
  });

  it('uses 1:1 aspect for sealed', () => {
    const { container } = render(<HoldingThumbnail {...baseProps} />);
    const chamber = container.firstElementChild as HTMLElement;
    expect(chamber.className).toMatch(/aspect-square/);
  });

  it('uses 5:7 aspect for cards', () => {
    const { container } = render(<HoldingThumbnail {...baseProps} kind="card" />);
    const chamber = container.firstElementChild as HTMLElement;
    expect(chamber.className).toMatch(/aspect-\[5\/7\]/);
  });

  it('renders the exhibit tag when provided', () => {
    render(<HoldingThumbnail {...baseProps} exhibitTag="ETB" />);
    expect(screen.getByText('ETB')).toBeDefined();
  });

  it('renders the stale dot when stale=true', () => {
    render(<HoldingThumbnail {...baseProps} stale />);
    expect(screen.getByLabelText('Stale price')).toBeDefined();
  });

  it('renders the owned pill when ownedQty is positive', () => {
    render(<HoldingThumbnail {...baseProps} ownedQty={4} />);
    expect(screen.getByText(/Owned · 4/)).toBeDefined();
  });

  it('omits the owned pill when ownedQty is 0 or undefined', () => {
    render(<HoldingThumbnail {...baseProps} ownedQty={0} />);
    expect(screen.queryByText(/Owned/)).toBeNull();
  });
});
