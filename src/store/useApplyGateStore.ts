// src/store/useApplyGateStore.ts
import { getUserProfileStatus } from "@/src/services/profile/api";
import { create } from "zustand";

type ApplyGateStatus =
  | { kind: "unknown" }
  | { kind: "checking" }
  | { kind: "allowed"; checkedAt: number }
  | { kind: "blocked"; checkedAt: number; missingProfileFields: string[] }
  | { kind: "error"; message: string };

type ApplyGateState = {
  status: ApplyGateStatus;

  // Cache controls
  lastUserId?: number;
  ttlMs: number;

  // State transitions
  reset: () => void;

  // Core action: check if user can apply
  ensureCanApply: (userId: number) => Promise<{
    ok: boolean;
    needsProfile: boolean;
    missingProfileFields: string[];
    error?: string;
  }>;
};

export const useApplyGateStore = create<ApplyGateState>((set, get) => ({
  status: { kind: "unknown" },
  lastUserId: undefined,
  ttlMs: 60_000, // 1 minute cache; adjust if needed

  reset() {
    set({ status: { kind: "unknown" }, lastUserId: undefined });
  },

  async ensureCanApply(userId: number) {
    if (!Number.isFinite(userId)) {
      const msg = "Invalid userId";
      set({ status: { kind: "error", message: msg } });
      return {
        ok: false,
        needsProfile: false,
        missingProfileFields: [],
        error: msg,
      };
    }

    const st = get().status;
    const { ttlMs, lastUserId } = get();

    // If we already checked recently for the same user, reuse decision.
    if (lastUserId === userId) {
      if (st.kind === "allowed" && Date.now() - st.checkedAt < ttlMs) {
        return { ok: true, needsProfile: false, missingProfileFields: [] };
      }
      if (st.kind === "blocked" && Date.now() - st.checkedAt < ttlMs) {
        return {
          ok: false,
          needsProfile: true,
          missingProfileFields: st.missingProfileFields,
        };
      }
    }

    set({ status: { kind: "checking" }, lastUserId: userId });

    try {
      const res = await getUserProfileStatus(userId);

      if (res.needsProfile) {
        const missing = res.missingProfileFields ?? [];
        set({
          status: {
            kind: "blocked",
            checkedAt: Date.now(),
            missingProfileFields: missing,
          },
          lastUserId: userId,
        });

        return {
          ok: false,
          needsProfile: true,
          missingProfileFields: missing,
        };
      }

      set({
        status: { kind: "allowed", checkedAt: Date.now() },
        lastUserId: userId,
      });

      return { ok: true, needsProfile: false, missingProfileFields: [] };
    } catch (e: any) {
      const msg = e?.message ?? "Failed to check profile status";
      set({ status: { kind: "error", message: msg }, lastUserId: userId });
      return {
        ok: false,
        needsProfile: false,
        missingProfileFields: [],
        error: msg,
      };
    }
  },
}));
