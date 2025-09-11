import { fxPostings } from '@/src/data/fixtures/home';
import { Posting } from '@/src/services/api/types';
import { create } from 'zustand';
const delay = (ms:number)=>new Promise(r=>setTimeout(r,ms));

type State = { recommended: Posting[]; status: 'idle'|'loading'|'success'|'error'; error?: string };
type Actions = { fetchRecommended: (opts?:{filter?:'trending'|'new'}) => Promise<void> };

export const useMarketStore = create<State & Actions>((set) => ({
  recommended: [], status: 'idle',
  async fetchRecommended() {
    set({ status: 'loading', error: undefined });
    try {
      await delay(250);
      set({ recommended: fxPostings, status: 'success' });
    } catch (e:any) {
      set({ status: 'error', error: e?.message ?? 'Failed' });
    }
  },
}));
