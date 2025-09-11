import { fxAssets, fxGoals, fxInsights, fxPermissions, fxStreakDays } from '@/src/data/fixtures/tracking';
import { Asset, AssetPermission, GoalStatus, Insight } from '@/src/services/tracking/types';
import { create } from 'zustand';

type Status = 'idle' | 'loading' | 'success' | 'error';

type State = {
  status: Status;
  error?: string;
  assets: Asset[];
  permissions: AssetPermission[];
  goals: GoalStatus[];
  streakDays: number;
  insights: Insight[];
  tileOrder: string[];      // asset ids in display order
  lastSyncedAt?: string;
};

type Actions = {
  requestPermissions: (ids?: string[]) => Promise<void>;
  syncToday: () => Promise<void>;
  setGoal: (id: string, target?: number) => void;
  setTileOrder: (order: string[]) => void;
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export const useTrackingStore = create<State & Actions>((set, get) => ({
  status: 'idle',
  assets: fxAssets,
  permissions: fxPermissions,
  goals: fxGoals,
  streakDays: fxStreakDays,
  insights: fxInsights,
  tileOrder: ['steps', 'active', 'sleep', 'hr_rest', 'energy'], // weight optional
  lastSyncedAt: undefined,

  async requestPermissions(ids) {
    // Seed-phase: pretend we asked & got granted
    const target = new Set(ids ?? get().permissions.map(p => p.id));

    // ✅ Narrow 'status' to the literal union member
    const updated: AssetPermission[] = get().permissions.map(p =>
      target.has(p.id)
        ? { ...p, status: 'granted' as const, lastPromptedAt: new Date().toISOString() }
        : p
    );
    set({ permissions: updated });

    // ✅ Narrow 'state' to the literal union member
    const assets: Asset[] = get().assets.map(a =>
      target.has(a.id) && a.state === 'permission_needed'
        ? { ...a, state: 'ok' as const }
        : a
    );
    set({ assets });
  },

  async syncToday() {
    set({ status: 'loading', error: undefined });
    try {
      await delay(300); // simulate I/O
      const now = new Date().toISOString();

      // ✅ Keep array typed as Asset[]
      const assets: Asset[] = get().assets.map(a => ({ ...a, freshness: now }));
      set({ assets, lastSyncedAt: now, status: 'success' });
    } catch (e: any) {
      set({ status: 'error', error: e?.message ?? 'Sync failed' });
    }
  },

  setGoal(id, target) {
    const goals: GoalStatus[] = get().goals.map(g => (g.id === id ? { ...g, target } : g));
    set({ goals });
  },

  setTileOrder(order) {
    set({ tileOrder: order });
  },
}));
