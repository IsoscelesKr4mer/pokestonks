// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KebabMenu, KebabMenuItem } from './kebab-menu';

describe('<KebabMenu>', () => {
  it('renders the trigger with the given aria-label', () => {
    render(
      <KebabMenu label="Actions for lot 1">
        <KebabMenuItem onSelect={() => {}}>Edit</KebabMenuItem>
      </KebabMenu>
    );
    expect(screen.getByLabelText('Actions for lot 1')).toBeDefined();
  });
});
