import { sharingSeed } from '@/src/data/fixtures/sharing';
import type { Application, ApplicationStatus, ShareState } from '@/src/services/sharing/types';
import { create } from 'zustand';
// import { getSharingState } from '@/src/services/sharing/mock'; // when ready

type Actions = {
  hydrateFromSeed: () => void;
  setApplications: (apps: Application[]) => void;
  fetchAll: () => Promise<void>;
};

export const useShareStore = create<ShareState & Actions>((set, get) => ({
  ...sharingSeed,
  hydrateFromSeed: () => set(sharingSeed),
  setApplications: (apps) => {
    const counts = countApps(apps);
    set({
      applications: apps,
      earnings: { ...get().earnings, apps: counts },
    });
  },
  fetchAll: async () => {
    // const data = await getSharingState(); // later: real API
    const data = sharingSeed;
    set(data);
  },
}));

function countApps(apps: Application[]) {
  return {
    applied: apps.filter(a => a.status === 'APPLIED').length,
    pending: apps.filter(a => a.status === 'PENDING').length,
    accepted: apps.filter(a => a.status === 'ACCEPTED').length,
    rejected: apps.filter(a => a.status === 'REJECTED').length,
  };
}

export const selectByStatus = (status: ApplicationStatus) =>
  (state: ShareState) => state.applications.filter(a => a.status === status);
