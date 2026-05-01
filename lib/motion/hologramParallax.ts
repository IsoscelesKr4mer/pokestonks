function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function attachHologramParallax(el: HTMLElement): () => void {
  if (reduceMotion()) return () => {};
  let raf = 0;
  let nextAngle = 110;
  let pending = false;
  const handle = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    nextAngle = 110 + Math.max(-1, Math.min(1, dx)) * 8;
    if (!pending) {
      pending = true;
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--holo-angle', `${nextAngle.toFixed(2)}deg`);
        pending = false;
      });
    }
  };
  const reset = () => {
    el.style.removeProperty('--holo-angle');
  };
  window.addEventListener('pointermove', handle, { passive: true });
  el.addEventListener('pointerleave', reset);
  return () => {
    window.removeEventListener('pointermove', handle);
    el.removeEventListener('pointerleave', reset);
    cancelAnimationFrame(raf);
    reset();
  };
}
