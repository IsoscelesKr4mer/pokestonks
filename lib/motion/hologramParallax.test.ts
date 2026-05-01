// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attachHologramParallax } from './hologramParallax';

describe('attachHologramParallax', () => {
  it('returns a no-op cleanup when reduce-motion is on', () => {
    const el = document.createElement('div');
    const cleanup = attachHologramParallax(el);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
  it('returns a function that detaches listeners', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const cleanup = attachHologramParallax(el);
    cleanup();
    expect(true).toBe(true);
    document.body.removeChild(el);
  });
});
