export { animateNumber } from './numberRoll';
export { attachHologramParallax } from './hologramParallax';
export { flipUnderline } from './tabUnderline';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
