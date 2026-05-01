export interface AnimateNumberOptions {
  durationMs?: number;
  format?: (n: number) => string;
  easing?: (t: number) => number;
}

const defaultEasing = (t: number) => 1 - Math.pow(1 - t, 3); // cubic-bezier(0.2,0.8,0.2,1) approx

function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function animateNumber(
  el: HTMLElement,
  from: number,
  to: number,
  opts: AnimateNumberOptions = {}
): () => void {
  const duration = opts.durationMs ?? 600;
  const format = opts.format ?? ((n: number) => Math.round(n).toString());
  const easing = opts.easing ?? defaultEasing;

  if (reduceMotion() || from === to || duration <= 0) {
    el.textContent = format(to);
    return () => {};
  }

  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = easing(t);
    const value = from + (to - from) * eased;
    el.textContent = format(value);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
