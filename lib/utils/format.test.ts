import { describe, it, expect } from 'vitest';
import { formatCents, formatCentsSigned, formatPct } from './format';

describe('formatCents', () => {
  it('formats positive cents as $X.XX', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
  });
  it('formats zero as $0.00', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
  it('formats negative cents as -$X.XX (sign before dollar sign)', () => {
    expect(formatCents(-123456)).toBe('-$1,234.56');
  });
  it('rounds half cents (sub-cent input)', () => {
    expect(formatCents(100)).toBe('$1.00');
  });
});

describe('formatCentsSigned', () => {
  it('positive gets a leading +', () => {
    expect(formatCentsSigned(12345)).toBe('+$123.45');
  });
  it('zero is unsigned', () => {
    expect(formatCentsSigned(0)).toBe('$0.00');
  });
  it('negative gets a leading -', () => {
    expect(formatCentsSigned(-12345)).toBe('-$123.45');
  });
});

describe('formatPct', () => {
  it('positive gets a leading + and one decimal by default', () => {
    expect(formatPct(12.345)).toBe('+12.3%');
  });
  it('zero is unsigned 0.0%', () => {
    expect(formatPct(0)).toBe('0.0%');
  });
  it('negative gets a leading - sign', () => {
    expect(formatPct(-7.5)).toBe('-7.5%');
  });
  it('respects custom decimals', () => {
    expect(formatPct(12.345, 2)).toBe('+12.35%');
  });
});
