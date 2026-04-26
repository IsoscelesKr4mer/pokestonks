const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Format a wall-clock time relative to now. Used by the SearchBox "Updated"
 * caption next to result counts.
 *
 *   under 5 min   -> "Updated just now"
 *   5-59 min      -> "Updated N minutes ago"
 *   1-23 hours    -> "Updated N hours ago"
 *   1+ days       -> "Updated N days ago"
 *   null          -> "Last updated unknown"
 */
export function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return 'Last updated unknown';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 5) return 'Updated just now';
  if (diffMin < 60) return `Updated ${rtf.format(-diffMin, 'minute')}`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${rtf.format(-diffHr, 'hour')}`;
  const diffDay = Math.floor(diffHr / 24);
  return `Updated ${rtf.format(-diffDay, 'day')}`;
}
