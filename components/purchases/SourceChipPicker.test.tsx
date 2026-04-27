// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourceChipPicker } from './SourceChipPicker';

describe('<SourceChipPicker>', () => {
  it('renders chip suggestions', () => {
    render(
      <SourceChipPicker
        value={null}
        onChange={() => {}}
        suggestions={['Walmart vending', 'Target', 'Costco']}
      />
    );
    expect(screen.getByRole('button', { name: 'Walmart vending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Target' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Costco' })).toBeInTheDocument();
  });

  it('clicking a chip sets the value', async () => {
    const onChange = vi.fn();
    render(
      <SourceChipPicker
        value={null}
        onChange={onChange}
        suggestions={['Walmart vending']}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Walmart vending' }));
    expect(onChange).toHaveBeenCalledWith('Walmart vending');
  });

  it('marks the active chip', () => {
    render(
      <SourceChipPicker
        value="Target"
        onChange={() => {}}
        suggestions={['Walmart vending', 'Target']}
      />
    );
    const active = screen.getByRole('button', { name: 'Target' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
  });

  it('Other reveals a free-text input that updates value', async () => {
    const onChange = vi.fn();
    render(<SourceChipPicker value={null} onChange={onChange} suggestions={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /other/i }));
    const input = screen.getByPlaceholderText(/source/i);
    await userEvent.type(input, 'Sam Club');
    // onChange fires per keystroke (controlled input in parent).
    expect(onChange).toHaveBeenLastCalledWith('Sam Club');
  });
});
