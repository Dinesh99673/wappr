/**
 * Bulk-send delay window (seconds).
 *
 * The lower bound is LOCKED at 5s — that's the floor we always keep between
 * sends so sending stays paced. The user picks the upper bound (via the slider on
 * the bulk page) anywhere from just above the floor up to MAX_DELAY_SEC. Each
 * send then waits a random time in [minSec, maxSec].
 */

export const MIN_DELAY_SEC = 5;
export const MAX_DELAY_SEC = 60;
export const DEFAULT_MAX_DELAY_SEC = 15;

export type DelayWindow = { minSec: number; maxSec: number };

/**
 * Resolves the delay window from a request's scalar fields. The min is always
 * pinned to MIN_DELAY_SEC; the incoming `maxDelaySec` is clamped into
 * [MIN_DELAY_SEC, MAX_DELAY_SEC]. Missing / invalid input falls back to the
 * default max so a job never runs with a nonsensical window.
 */
export function resolveDelayWindow(
  fields: Record<string, string>,
): DelayWindow {
  const raw = Number(fields.maxDelaySec);
  const maxSec = Number.isFinite(raw)
    ? Math.min(MAX_DELAY_SEC, Math.max(MIN_DELAY_SEC, Math.round(raw)))
    : DEFAULT_MAX_DELAY_SEC;
  return { minSec: MIN_DELAY_SEC, maxSec };
}
