// Purely presentational number formatting — the Cr/L short form used
// throughout Indian real-estate reporting. This never decides anything and
// never changes a figure the API sent; it only chooses how many digits and
// which unit label to show. See the rule at the top of App.tsx: the API
// computes every number, the frontend only displays it.

export function formatCompactInr(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${(value / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function formatPct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
