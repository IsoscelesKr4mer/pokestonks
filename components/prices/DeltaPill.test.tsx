// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeltaPill } from './DeltaPill';

describe('<DeltaPill>', () => {
  it('renders positive delta with + sign and 7d window', () => {
    render(<DeltaPill deltaCents={350} deltaPct={8.2} />);
    expect(screen.getByText(/\+\$3\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\+8\.2%/)).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
  });

  it('renders negative delta with - sign', () => {
    render(<DeltaPill deltaCents={-120} deltaPct={-2.8} />);
    expect(screen.getByText(/-\$1\.20/)).toBeInTheDocument();
    expect(screen.getByText(/-2\.8%/)).toBeInTheDocument();
  });

  it('renders muted "—" when deltaCents is null', () => {
    render(<DeltaPill deltaCents={null} deltaPct={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('respects windowLabel prop', () => {
    render(<DeltaPill deltaCents={100} deltaPct={5} windowLabel="30d" />);
    expect(screen.getByText('30d')).toBeInTheDocument();
  });
});
