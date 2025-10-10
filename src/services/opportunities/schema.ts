// src/services/opportunities/schema.ts

/** Raw shape: matches current seed/team structure and Home usage */
export type RawOpportunity = {
  id: string;
  title: string;
  description?: string;
  image?: string;
  category?: string;              // optional for Home; useful for Marketplace filters
  tags?: string[];                // Home uses tags already
  reward?: {
    badge?: string;               // Home displays
    credits?: number;             // Home displays
  };
  createdAt: string;              // ISO
  // Safe-to-add fields (future API):
  sponsor?: string;
  estimatedTimeMins?: number;
  status?: "open" | "closed";
  endDate?: string;               // ISO
  dataTypes?: string[];
  privacyNotes?: string[];
  howItWorks?: string[];
};

/** UI-normalized shape: extends raw with derived helpers. We never remove raw fields. */
export type UIOpportunity = RawOpportunity & {
  rewardCredits: number;          // derived from reward?.credits
  rewardBadge?: string;           // derived from reward?.badge
};

export function normalizeOpportunity(raw: RawOpportunity): UIOpportunity {
  const credits = raw.reward?.credits ?? 0;
  const badge = raw.reward?.badge;

  return {
    ...raw,
    rewardCredits: credits,
    rewardBadge: badge,
    tags: raw.tags ?? [],
    category: raw.category ?? "General",
  };
}

/** Small helpers for Marketplace facets */
export function extractCategories(items: UIOpportunity[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => set.add(i.category ?? "General"));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function extractTags(items: UIOpportunity[], limit = 8): string[] {
  const counts = new Map<string, number>();
  items.forEach((i) => (i.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}
