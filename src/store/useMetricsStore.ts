import { fxMetrics } from '@/src/data/fixtures/home';
import { Metric } from '@/src/services/api/types';
import { create } from 'zustand';

type State = { metrics: Metric[]; status: 'idle'|'loading'|'success'|'error'; error?: string };
type Actions = { fetchToday: () => Promise<void> };
const delay = (ms:number)=>new Promise(r=>setTimeout(r,ms));

export const useMetricsStore = create<State & Actions>((set) => ({
  metrics: [], status: 'idle',
  async fetchToday() {
    set({ status: 'loading', error: undefined });
    try {
      await delay(250);
      set({ metrics: fxMetrics, status: 'success' });
    } catch (e:any) {
      set({ status: 'error', error: e?.message ?? 'Failed' });
    }
  },
}));
