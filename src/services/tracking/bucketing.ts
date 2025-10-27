
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
