import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from './time';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Last updated unknown" for null', () => {
    expect(formatRelativeTime(null)).toBe('Last updated unknown');
  });

  it('returns "Updated just now" for under 5 minutes', () => {
    const d = new Date('2026-04-26T11:58:00Z');
    expect(formatRelativeTime(d)).toBe('Updated just now');
  });

  it('returns minutes for 5-59 minutes', () => {
    const d = new Date('2026-04-26T11:30:00Z'); // 30 min ago
    expect(formatRelativeTime(d)).toMatch(/Updated 30 minutes ago/);
  });

  it('returns hours for 1-23 hours', () => {
    const d = new Date('2026-04-26T07:00:00Z'); // 5 hours ago
    expect(formatRelativeTime(d)).toMatch(/Updated 5 hours ago/);
  });

  it('returns days for 24+ hours', () => {
    const d = new Date('2026-04-23T12:00:00Z'); // 3 days ago
    expect(formatRelativeTime(d)).toMatch(/Updated 3 days ago/);
  });
});
