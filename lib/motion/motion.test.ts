// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import * as motion from './index';

describe('motion barrel', () => {
  it('re-exports all primitives', () => {
    expect(typeof motion.animateNumber).toBe('function');
    expect(typeof motion.attachHologramParallax).toBe('function');
    expect(typeof motion.flipUnderline).toBe('function');
    expect(typeof motion.prefersReducedMotion).toBe('function');
  });
});
