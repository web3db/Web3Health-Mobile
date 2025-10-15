// src/utils/guards.ts
export const hasAny = (arr?: Array<any>) => Array.isArray(arr) && arr.length > 0;
export const hasText = (s?: string | null) => !!(s && s.trim().length > 0);

export const formatAgeRange = (min?: number | null, max?: number | null) => {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `≤${max}`;
  return null;
};

export const minsToHrMin = (mins?: number | null) => {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
};
