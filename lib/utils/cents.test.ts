import { describe, expect, it } from 'vitest';
import { dollarsStringToCents } from './cents';

describe('dollarsStringToCents', () => {
  it('converts whole dollars', () => {
    expect(dollarsStringToCents('5')).toBe(500);
  });
  it('converts cents correctly for typical values', () => {
    expect(dollarsStringToCents('5.99')).toBe(599);
    expect(dollarsStringToCents('0.10')).toBe(10);
  });
  it('handles FP-prone values exactly', () => {
    expect(dollarsStringToCents('0.295')).toBe(30);
    expect(dollarsStringToCents('0.1')).toBe(10);
    expect(dollarsStringToCents('0.2')).toBe(20);
    expect(dollarsStringToCents('0.30')).toBe(30);
  });
  it('handles inputs with commas and $ symbols', () => {
    expect(dollarsStringToCents('$1,234.56')).toBe(123456);
  });
  it('returns null for invalid inputs', () => {
    expect(dollarsStringToCents('')).toBeNull();
    expect(dollarsStringToCents('abc')).toBeNull();
    expect(dollarsStringToCents('1.234')).toBe(123);
  });
});
