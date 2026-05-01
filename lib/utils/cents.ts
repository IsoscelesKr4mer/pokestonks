/**
 * Parse a user-typed dollar string into integer cents without FP errors.
 * Handles "$1,234.56", "5.99", "0.30", "1.234" (sub-cent rounded at 3rd decimal).
 * "0.295" returns 30 (rounds up), "1.234" returns 123 (rounds down).
 * Returns null for unparseable inputs.
 */
export function dollarsStringToCents(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const abs = negative ? cleaned.slice(1) : cleaned;
  const [whole, frac = ''] = abs.split('.');
  if (!whole && !frac) return null;
  const wholeCents = (whole ? parseInt(whole, 10) : 0) * 100;
  if (Number.isNaN(wholeCents)) return null;
  // Pad/trim frac to 3 chars so we can peek at 3rd digit for rounding
  const fracPadded = (frac + '000').slice(0, 3);
  const firstTwo = fracPadded.slice(0, 2);
  const third = fracPadded.charAt(2);
  let fracCents = parseInt(firstTwo, 10);
  if (Number.isNaN(fracCents)) return null;
  if (third >= '5') fracCents += 1;
  const total = wholeCents + fracCents;
  return negative ? -total : total;
}
