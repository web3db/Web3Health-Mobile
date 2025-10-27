// src/store/useMarketStore.ts
import { getMarketplacePostingById, listMarketplacePostings } from "@/src/services/opportunities/api";
import type { Opportunity } from "@/src/services/opportunities/types";
import { create } from "zustand";

export type SortKey = "newest" | "reward";

// --- helpers ---
function uniqueMergeById(existing: Opportunity[], incoming: Opportunity[]): Opportunity[] {
  const map = new Map<string, Opportunity>();
  for (const it of existing) map.set(it.id, it);
  for (const it of incoming) map.set(it.id, it);
  return Array.from(map.values());
}

// --- store ---
type State = {
  items: Opportunity[];
  loading: boolean;
  error?: string | null;

  // pagination
  page: number;
  pageSize: number;
  hasNext: boolean;

  // in-flight guards
  inFlightPage: number | null;
  loadingIds: Record<string, boolean>;

  // filters / ui
  query: string;
  selectedTags: string[];
  minCredits: number | null;
  sort: SortKey;
  savedIds: string[];
  lastListOffset: number;

  // API actions
  loadAll: (opts?: { page?: number; pageSize?: number; reset?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  loadById: (id: string, opts?: { force?: boolean }) => Promise<Opportunity | undefined>;

  // ui actions
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
  error: null,

  // pagination defaults
  page: 1,
  pageSize: 10,
  hasNext: true,

  // in-flight guards
  inFlightPage: null,
  loadingIds: {},

  // filters / ui
  query: "",
  selectedTags: [],
  minCredits: null,
  sort: "newest",
  savedIds: [],
  lastListOffset: 0,

  // Fetch a page. By default replaces items (reset = true).
  loadAll: async (opts) => {
    const nextPage = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? get().pageSize;
    const reset = opts?.reset ?? true;

    // prevent duplicate requests for the same page
    const { inFlightPage } = get();
    if (inFlightPage === nextPage) return;

    if (__DEV__) console.log("[useMarketStore.loadAll]", { nextPage, pageSize, reset });
    set({ loading: true, error: null, inFlightPage: nextPage });

    try {
      const res = await listMarketplacePostings({ page: nextPage, pageSize });

      set((s) => {
        const nextItems = reset ? res.items : uniqueMergeById(s.items, res.items);
        return {
          items: nextItems,
          loading: false,
          error: null,
          page: res.page,
          pageSize: res.pageSize,
          hasNext: res.hasNext,
          inFlightPage: null,
        };
      });
    } catch (e: any) {
      if (__DEV__) console.warn("[useMarketStore.loadAll] failed:", e);
      set({ loading: false, error: e?.message || "Failed to load marketplace", inFlightPage: null });
    }
  },

  // Fetch next page and append de-duped items
  loadMore: async () => {
    const { loading, hasNext, page, pageSize } = get();
    if (loading || !hasNext) return;
    return get().loadAll({ page: page + 1, pageSize, reset: false });
  },

  // Load single item; if cached full and not forced, return cache
  // ⬇️ Replace your current loadById with this guarded version
  loadById: async (id, opts) => {
    const { loadingIds } = get();
    if (loadingIds[id]) {
      if (__DEV__) console.log("[useMarketStore.loadById] already loading", id);
      return get().items.find((it) => it.id === id);
    }

    const cached = get().items.find((it) => it.id === id);
    const isFull = cached?.detailLevel === "full";
    if (cached && isFull && !opts?.force) {
      if (__DEV__) console.log("[useMarketStore.loadById] cache hit (full)", id);
      return cached;
    }

    if (__DEV__) console.log("[useMarketStore.loadById] fetching", id, "force=", !!opts?.force);
    set((s) => ({ loadingIds: { ...s.loadingIds, [id]: true } }));

    try {
      const fetched = await getMarketplacePostingById(id);

      set((s) => {
        const nextLoading = { ...s.loadingIds };
        delete nextLoading[id];

        if (!fetched) return { loadingIds: nextLoading };

        // 🔒 sanity guard: fetched must match requested id
        if (fetched.id !== id) {
          if (__DEV__) {
            console.warn(
              "[useMarketStore.loadById] fetched id mismatch: requested=",
              id,
              " got=",
              fetched.id,
              " (skipping cache insert)"
            );
          }
          return { loadingIds: nextLoading };
        }

        // upsert into items
        const items = s.items.slice();
        const idx = items.findIndex((x) => x.id === id);
        if (idx >= 0) items[idx] = fetched;
        else items.push(fetched);

        return { items, loadingIds: nextLoading };
      });

      return fetched ?? undefined;
    } catch (e) {
      if (__DEV__) console.warn("[useMarketStore.loadById] failed:", e);
      set((s) => {
        const nextLoading = { ...s.loadingIds };
        delete nextLoading[id];
        return { loadingIds: nextLoading };
      });
      return undefined;
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
  clearFilters: () => set({ query: "", selectedTags: [], minCredits: null, sort: "newest" }),
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
      default: {
        const ts = (d?: string | null) => (d ? new Date(d).getTime() : 0);
        out.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
        break;
      }
    }
    return out;
  },

  isSaved: (id) => get().savedIds.includes(id),
  getByIdSafe: (id) => get().items.find((i) => i.id === id),
}));

// Keep existing alias/exports
export const useMarketplaceStore = useMarketStore;
export default useMarketStore;
