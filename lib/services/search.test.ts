import { describe, it, expect } from 'vitest';
import { tokenizeQuery } from './search';

describe('tokenizeQuery', () => {
  it('classifies a card_number_full token', () => {
    expect(tokenizeQuery('199/091')).toEqual({
      text: [],
      cardNumberFull: '199/091',
      cardNumberPartial: null,
      setCode: null,
    });
  });

  it('classifies a 1-3 digit numeric as card_number_partial', () => {
    expect(tokenizeQuery('199').cardNumberPartial).toBe('199');
    expect(tokenizeQuery('74').cardNumberPartial).toBe('74');
  });

  it('classifies a set code', () => {
    expect(tokenizeQuery('sv3pt5').setCode).toBe('sv3pt5');
    expect(tokenizeQuery('SWSH11').setCode).toBe('swsh11');
  });

  it('classifies plain words as text', () => {
    expect(tokenizeQuery('charizard ex').text).toEqual(['charizard', 'ex']);
  });

  it('handles a mixed query', () => {
    const t = tokenizeQuery('charizard ex 199');
    expect(t.text).toEqual(['charizard', 'ex']);
    expect(t.cardNumberPartial).toBe('199');
  });

  it('handles set code + full card number', () => {
    const t = tokenizeQuery('sv3pt5 199/091');
    expect(t.setCode).toBe('sv3pt5');
    expect(t.cardNumberFull).toBe('199/091');
  });

  it('lowercases and trims', () => {
    expect(tokenizeQuery('  Charizard  EX  ').text).toEqual(['charizard', 'ex']);
  });

  it('returns all-empty for empty input', () => {
    expect(tokenizeQuery('')).toEqual({
      text: [],
      cardNumberFull: null,
      cardNumberPartial: null,
      setCode: null,
    });
  });
});
