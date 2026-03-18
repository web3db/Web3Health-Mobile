// src/store/useApplyGateStore.ts
import { getUserProfileStatus } from "@/src/services/profile/api";
import { create } from "zustand";

type ApplyGateStatus =
  | { kind: "unknown" }
  | { kind: "checking" }
  | { kind: "allowed"; checkedAt: number }
  | { kind: "blocked"; checkedAt: number; missingProfileFields: string[] }
  | { kind: "error"; message: string };

type ApplyGateResult = {
  ok: boolean;
  needsProfile: boolean;
  missingProfileFields: string[];
  error?: string;
};

type ApplyGateState = {
  status: ApplyGateStatus;
  lastUserId?: number;
  ttlMs: number;
  reset: () => void;
  invalidateForUser: (userId: number) => void;
  ensureCanApply: (userId: number) => Promise<ApplyGateResult>;
};

export const useApplyGateStore = create<ApplyGateState>((set, get) => {
  const allowedResult = (): ApplyGateResult => ({
    ok: true,
    needsProfile: false,
    missingProfileFields: [],
  });

  const blockedResult = (missingProfileFields: string[]): ApplyGateResult => ({
    ok: false,
    needsProfile: true,
    missingProfileFields,
  });

  const errorResult = (error: string): ApplyGateResult => ({
    ok: false,
    needsProfile: false,
    missingProfileFields: [],
    error,
  });

  return {
    status: { kind: "unknown" },
    lastUserId: undefined,
    ttlMs: 60_000,

    reset() {
      set({ status: { kind: "unknown" }, lastUserId: undefined });
    },

    invalidateForUser(userId: number) {
      const { lastUserId } = get();
      if (lastUserId !== userId) return;
      set({ status: { kind: "unknown" }, lastUserId: undefined });
    },

    async ensureCanApply(userId: number) {
      if (!Number.isFinite(userId)) {
        const msg = "Invalid userId";
        set({ status: { kind: "error", message: msg }, lastUserId: undefined });
        return errorResult(msg);
      }

      const { status, ttlMs, lastUserId } = get();
      const now = Date.now();

      if (lastUserId === userId) {
        if (status.kind === "allowed" && now - status.checkedAt < ttlMs) {
          return allowedResult();
        }

        if (status.kind === "blocked" && now - status.checkedAt < ttlMs) {
          return blockedResult(status.missingProfileFields);
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
              checkedAt: now,
              missingProfileFields: missing,
            },
            lastUserId: userId,
          });
          return blockedResult(missing);
        }

        set({
          status: { kind: "allowed", checkedAt: now },
          lastUserId: userId,
        });
        return allowedResult();
      } catch (e: any) {
        const msg = e?.message ?? "Failed to check profile status";
        set({ status: { kind: "error", message: msg }, lastUserId: userId });
        return errorResult(msg);
      }
    },
  };
});
