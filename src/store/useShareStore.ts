import { fxShares } from '@/src/data/fixtures/home';
import { Share } from '@/src/services/api/types';
import { create } from 'zustand';
const delay = (ms:number)=>new Promise(r=>setTimeout(r,ms));

type State = { highlights: Share[]; status: 'idle'|'loading'|'success'|'error'; error?: string };
type Actions = { fetchHighlights: () => Promise<void> };

export const useShareStore = create<State & Actions>((set) => ({
  highlights: [], status: 'idle',
  async fetchHighlights() {
    set({ status: 'loading', error: undefined });
    try {
      await delay(250);
      set({ highlights: fxShares, status: 'success' });
    } catch (e:any) {
      set({ status: 'error', error: e?.message ?? 'Failed' });
    }
  },
}));
