function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates an indicator element from its current bounding rect to the rect
 * of the given target via FLIP. Caller is responsible for re-positioning
 * the indicator to the target between frames; this function just animates
 * the visual delta.
 */
export function flipUnderline(
  indicator: HTMLElement,
  fromRect: DOMRect,
  toRect: DOMRect
): Animation | null {
  if (reduceMotion()) return null;
  if (fromRect.left === toRect.left && fromRect.width === toRect.width) return null;
  const dx = fromRect.left - toRect.left;
  const sx = fromRect.width / toRect.width;
  return indicator.animate(
    [
      { transform: `translateX(${dx}px) scaleX(${sx})` },
      { transform: 'translateX(0) scaleX(1)' },
    ],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' }
  );
}
