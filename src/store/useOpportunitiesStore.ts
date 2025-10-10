import { getRecentTop10, getRecommendedTop10 } from "@/src/services/opportunities/mock";
import { Opportunity } from "@/src/services/opportunities/types";
import { create } from "zustand";

type Status = "idle" | "loading" | "success" | "error";

type State = {
  recStatus: Status;
  allStatus: Status;
  recommended: Opportunity[];
  recent: Opportunity[];
  error?: string;
};

type Actions = {
  fetchRecommended: () => Promise<void>;
  fetchRecent: () => Promise<void>;
};

export const useOpportunitiesStore = create<State & Actions>((set) => ({
  recStatus: "idle",
  allStatus: "idle",
  recommended: [],
  recent: [],
  async fetchRecommended() {
    set({ recStatus: "loading", error: undefined });
    try {
      const data = await getRecommendedTop10();
      set({ recommended: data, recStatus: "success" });
    } catch (e: any) {
      set({ recStatus: "error", error: e?.message ?? "Failed to load recommended" });
    }
  },
  async fetchRecent() {
    set({ allStatus: "loading", error: undefined });
    try {
      const data = await getRecentTop10();
      set({ recent: data, allStatus: "success" });
    } catch (e: any) {
      set({ allStatus: "error", error: e?.message ?? "Failed to load recent" });
    }
  },
}));
