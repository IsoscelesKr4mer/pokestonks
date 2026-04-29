import { describe, it, expect } from 'vitest';
import { csvRow, csvEscape } from './csv';

describe('csvEscape', () => {
  it('returns plain values unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(123)).toBe('123');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes values with commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('quotes values with double-quotes and doubles internal quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('csvRow', () => {
  it('joins values with commas + CRLF terminator', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c\r\n');
  });

  it('escapes each cell independently', () => {
    expect(csvRow(['plain', 'with,comma', 'with "quote"'])).toBe('plain,"with,comma","with ""quote"""\r\n');
  });
});
