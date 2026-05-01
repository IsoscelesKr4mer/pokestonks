// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VaultDialogHeader, DialogPreview } from './dialog-form';

describe('dialog-form', () => {
  it('renders header title and sub', () => {
    render(<VaultDialogHeader title="Sell" sub="2 lots will be touched" />);
    expect(screen.getByText('Sell')).toBeDefined();
    expect(screen.getByText('2 lots will be touched')).toBeDefined();
  });
  it('preview applies positive tone to the last row', () => {
    const { container } = render(
      <DialogPreview rows={[{ label: 'Lot 1', value: '$26.27' }, { label: 'Net', value: '+$110.66', tone: 'positive' }]} />
    );
    expect(container.querySelector('.text-positive')).toBeTruthy();
  });
});
