/** Age-based backoff intervals for rechecking flight data freshness. */
const BACKOFF_INTERVALS_MS: readonly { readonly maxAgeDays: number; readonly intervalMs: number }[] = [
  { maxAgeDays: 0, intervalMs: 30 * 60 * 1000 },    // today: 30 minutes
  { maxAgeDays: 1, intervalMs: 60 * 60 * 1000 },    // yesterday: 1 hour
  { maxAgeDays: 3, intervalMs: 2 * 60 * 60 * 1000 }, // 2-3 days: 2 hours
  { maxAgeDays: 7, intervalMs: 6 * 60 * 60 * 1000 }, // 4-7 days: 6 hours
  { maxAgeDays: 14, intervalMs: 12 * 60 * 60 * 1000 }, // 8-14 days: 12 hours
] as const;

function dateDiffDays(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr + "T00:00:00.000Z");
  return Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Returns whether a recheck is due for a given date.
 * Cold dates (> 14 days) never need rechecking.
 */
export function isRecheckDue(dateStr: string, lastCheckedAt: string | null): boolean {
  const ageDays = dateDiffDays(dateStr);

  const tier = BACKOFF_INTERVALS_MS.find((t) => ageDays <= t.maxAgeDays);
  if (!tier) return false; // cold date — no recheck

  if (!lastCheckedAt) return true; // never checked

  const elapsed = Date.now() - new Date(lastCheckedAt).getTime();
  return elapsed >= tier.intervalMs;
}
