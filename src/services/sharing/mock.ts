import { sharingSeed } from '@/src/data/fixtures/sharing';
import type { ShareState } from './types';

export async function getSharingState(): Promise<ShareState> {
  // later: swap to api.get('/sharing')
  return new Promise(res => setTimeout(() => res(sharingSeed), 150));
}
