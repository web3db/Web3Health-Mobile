export type Range = { start: Date; end: Date };

export function makeDailyEdges(days: number): Range[] {
  const edges: Range[] = [];
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate()); // local midnight
  start.setDate(start.getDate() - (days - 1)); // include today as last bucket
  for (let i = 0; i < days; i++) {
    const s = new Date(start);
    s.setDate(start.getDate() + i);
    const e = new Date(s);
    e.setDate(s.getDate() + 1);
    edges.push({ start: s, end: e });
  }
  return edges;
}

export function makeHourlyEdges24(): Range[] {
  const edges: Range[] = [];
  const end = new Date();
  const start = new Date(end);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() - 23);
  for (let i = 0; i < 24; i++) {
    const s = new Date(start);
    s.setHours(start.getHours() + i);
    const e = new Date(s);
    e.setHours(s.getHours() + 1);
    edges.push({ start: s, end: e });
  }
  return edges;
}

/** Clip [s,e] to [rs,re] and return milliseconds overlapped (>=0). */
export function overlappedMs(s: Date, e: Date, rs: Date, re: Date): number {
  const start = Math.max(s.getTime(), rs.getTime());
  const end = Math.min(e.getTime(), re.getTime());
  return Math.max(0, end - start);
}

/** ─────────────────────────────────────────────────────────────────────────────
 * UTC bucket edges for Sharing windows
 * - Window semantics: inclusive start, exclusive end: [fromUtc, toUtc)
 * - Bucket alignment is done in UTC, not local time
 * - Returned Dates are normal JS Date objects (epoch-based), safe cross-platform
 * ───────────────────────────────────────────────────────────────────────────── */

function parseUtcMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

function clampBucketMinutes(bucketMinutes: number): number {
  const n = Number(bucketMinutes);
  if (!Number.isFinite(n)) return 60;
  return Math.max(1, Math.floor(n));
}

/** Floor epoch-ms down to the nearest UTC bucket boundary. */
function floorToUtcBucketMs(tMs: number, bucketMinutes: number): number {
  const bucketMs = clampBucketMinutes(bucketMinutes) * 60_000;
  return Math.floor(tMs / bucketMs) * bucketMs;
}

/**
 * Build UTC-aligned bucket edges that fully cover [fromUtcISO, toUtcISO).
 * Example: bucketMinutes=5 → 12 buckets per hour.
 */
export function makeUtcBucketEdges(
  fromUtcISO: string,
  toUtcISO: string,
  bucketMinutes: number,
): Range[] {
  const fromMs = parseUtcMs(fromUtcISO);
  const toMs = parseUtcMs(toUtcISO);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return [];
  }

  const bm = clampBucketMinutes(bucketMinutes);
  const bucketMs = bm * 60_000;

  // Align start down to the bucket boundary so the edges are stable and deterministic.
  const alignedStartMs = floorToUtcBucketMs(fromMs, bm);

  const edges: Range[] = [];
  for (let sMs = alignedStartMs; sMs < toMs; sMs += bucketMs) {
    const eMs = sMs + bucketMs;

    // Skip buckets that end before the window starts
    if (eMs <= fromMs) continue;

    // Stop if bucket start is already beyond the window end
    if (sMs >= toMs) break;

    edges.push({ start: new Date(sMs), end: new Date(eMs) });
  }

  return edges;
}

/**
 * Convenience wrapper when you already have a window object.
 * (Matches your summarizer/healthkit/healthconnect window shapes.)
 */
export function makeUtcBucketEdgesForWindow(
  window: { fromUtc: string; toUtc: string },
  bucketMinutes: number,
): Range[] {
  return makeUtcBucketEdges(window.fromUtc, window.toUtc, bucketMinutes);
}
