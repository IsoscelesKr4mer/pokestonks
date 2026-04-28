export function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCentsSigned(cents: number): string {
  if (cents === 0) return '$0.00';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '+';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(pct: number, decimals: number = 1): string {
  if (pct === 0) return `0.${'0'.repeat(decimals)}%`;
  const sign = pct < 0 ? '-' : '+';
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}
