// src/store/useMarketStore.ts
import { getRecentTop10, getRecommendedTop10 } from "@/src/services/opportunities/mock";
import { Opportunity } from "@/src/services/opportunities/types";
import { create } from "zustand";

export type SortKey = "newest" | "reward";

type State = {
  items: Opportunity[];
  loading: boolean;

  query: string;
  selectedTags: string[];
  minCredits: number | null;
  sort: SortKey;
  savedIds: string[];
  lastListOffset: number;

  loadAll: () => Promise<void>;
  setQuery: (q: string) => void;
  toggleTag: (tag: string) => void;
  setMinCredits: (n: number | null) => void;
  setSort: (s: SortKey) => void;
  clearFilters: () => void;
  toggleSave: (id: string) => void;
  setListOffset: (y: number) => void;

  filteredItems: () => Opportunity[];
  isSaved: (id: string) => boolean;
  getByIdSafe: (id: string) => Opportunity | undefined;
};

export const useMarketStore = create<State>((set, get) => ({
  items: [],
  loading: false,

  query: "",
  selectedTags: [],
  minCredits: null,
  sort: "newest",
  savedIds: [],
  lastListOffset: 0,

  loadAll: async () => {
    set({ loading: true });
    try {
      const [recent, recommended] = await Promise.all([
        getRecentTop10(),
        getRecommendedTop10(),
      ]);

      const map = new Map<string, Opportunity>();
      [...recent, ...recommended].forEach((o) => map.set(o.id, o));

      const items = Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      set({ items, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setQuery: (q) => set({ query: q }),
  toggleTag: (tag) =>
    set((s) => ({
      selectedTags: s.selectedTags.includes(tag)
        ? s.selectedTags.filter((t) => t !== tag)
        : [...s.selectedTags, tag],
    })),
  setMinCredits: (n) => set({ minCredits: n }),
  setSort: (s) => set({ sort: s }),
  clearFilters: () =>
    set({ query: "", selectedTags: [], minCredits: null, sort: "newest" }),
  toggleSave: (id) =>
    set((s) => ({
      savedIds: s.savedIds.includes(id)
        ? s.savedIds.filter((x) => x !== id)
        : [...s.savedIds, id],
    })),
  setListOffset: (y) => set({ lastListOffset: y }),

  filteredItems: () => {
    const { items, query, selectedTags, minCredits, sort } = get();
    const q = query.trim().toLowerCase();
    let out = items.slice();

    if (q) {
      out = out.filter((it) => {
        const inTitle = it.title?.toLowerCase().includes(q);
        const inDesc = it.description?.toLowerCase().includes(q);
        const inTags = (it.tags ?? []).some((t) => t.toLowerCase().includes(q));
        return inTitle || inDesc || inTags;
      });
    }

    if (selectedTags.length) {
      out = out.filter((it) => (it.tags ?? []).some((t) => selectedTags.includes(t)));
    }

    if (minCredits != null) {
      out = out.filter((it) => (it.reward?.credits ?? 0) >= minCredits);
    }

    switch (sort) {
      case "reward":
        out.sort((a, b) => (b.reward?.credits ?? 0) - (a.reward?.credits ?? 0));
        break;
      case "newest":
      default:
        out.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
    }
    return out;
  },

  isSaved: (id) => get().savedIds.includes(id),
  getByIdSafe: (id) => get().items.find((i) => i.id === id),
}));

// 👉 Alias so existing imports keep working
export const useMarketplaceStore = useMarketStore;

// Optional default export if you prefer
export default useMarketStore;
