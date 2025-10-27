// src/store/useMastersStore.ts
import {
  getHealthConditions,
  getMeasurementSystems,
  getRaces,
  getSexes,
  getUnits,
  type HealthConditionOption,
  type Option,
} from '@/src/services/profile/api';
import { create } from 'zustand';

type MastersState = {
  races: Option[];
  sexes: Option[];
  measurementSystems: Option[];
  units: Option[];
  healthConditions: HealthConditionOption[];   // ✅ fix type
  loading: boolean;
  error?: string | null;
  loadedAt?: number;
  _inflight?: Promise<void> | null;

  loadMastersOnce: (opts?: { ttlMs?: number }) => Promise<void>;
  refreshMasters: () => Promise<void>;
};

export const useMastersStore = create<MastersState>((set, get) => ({
  // ✅ use arrays, not nulls
  races: [],
  sexes: [],
  measurementSystems: [],
  units: [],
  healthConditions: [],
  loading: false,
  error: null,
  loadedAt: undefined,
  _inflight: null,

  async loadMastersOnce(opts) {
    const { loadedAt, races, sexes, measurementSystems, units, healthConditions, _inflight } = get();
    const ttlMs = opts?.ttlMs ?? 0;

    // Share the in-flight request
    if (_inflight) return _inflight;

    // Cache hit (and all lists present)
    const isFresh = loadedAt && (!ttlMs || Date.now() - loadedAt < ttlMs);
    if (isFresh && races.length && sexes.length && measurementSystems.length && units.length && healthConditions.length) {
      return Promise.resolve();
    }

    const p = (async () => {
      try {
        set({ loading: true, error: null });

        const [r, s, ms, u, hc] = await Promise.all([
          getRaces(),
          getSexes(),
          getMeasurementSystems(),
          getUnits(),
          getHealthConditions(),
        ]);

        // Optional: filter unusable rows (e.g., unit with null label/id)
        const safeUnits = u.filter(x => Number.isFinite(x.id));
        const safeRaces = r.filter(x => Number.isFinite(x.id));
        const safeSexes = s.filter(x => Number.isFinite(x.id));
        const safeMs = ms.filter(x => Number.isFinite(x.id));
        const safeHc = hc.filter(x => Number.isFinite(x.id));

        set({
          races: safeRaces,
          sexes: safeSexes,
          measurementSystems: safeMs,
          units: safeUnits,
          healthConditions: safeHc,
          loading: false,
          error: null,
          loadedAt: Date.now(),
        });
      } catch (e: any) {
        set({ loading: false, error: e?.message ?? 'Failed to load masters' });
      } finally {
        set({ _inflight: null });
      }
    })();

    set({ _inflight: p });
    return p;
  },

  async refreshMasters() {
    const { _inflight } = get();
    if (_inflight) return _inflight;

    const p = (async () => {
      try {
        set({ loading: true, error: null });

        const [r, s, ms, u, hc] = await Promise.all([
          getRaces(),
          getSexes(),
          getMeasurementSystems(),
          getUnits(),
          getHealthConditions(),
        ]);

        const safeUnits = u.filter(x => Number.isFinite(x.id));
        const safeRaces = r.filter(x => Number.isFinite(x.id));
        const safeSexes = s.filter(x => Number.isFinite(x.id));
        const safeMs = ms.filter(x => Number.isFinite(x.id));
        const safeHc = hc.filter(x => Number.isFinite(x.id));

        set({
          races: safeRaces,
          sexes: safeSexes,
          measurementSystems: safeMs,
          units: safeUnits,
          healthConditions: safeHc,
          loading: false,
          error: null,
          loadedAt: Date.now(),
        });
      } catch (e: any) {
        set({ loading: false, error: e?.message ?? 'Failed to refresh masters' });
      } finally {
        set({ _inflight: null });
      }
    })();

    set({ _inflight: p });
    return p;
  },
}));
