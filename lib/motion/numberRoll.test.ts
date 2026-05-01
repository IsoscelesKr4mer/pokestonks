// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { animateNumber } from './numberRoll';

describe('animateNumber', () => {
  it('mounts the final value into element.textContent immediately when reduce-motion is on', () => {
    const el = document.createElement('span');
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);
    animateNumber(el, 0, 12345, { format: (n) => `$${n.toLocaleString()}` });
    expect(el.textContent).toBe('$12,345');
    matchMedia.mockRestore();
  });

  it('returns a cancel function', () => {
    const el = document.createElement('span');
    const cancel = animateNumber(el, 0, 100);
    expect(typeof cancel).toBe('function');
    cancel();
  });
});
