import { profileSeed } from '@/src/data/fixtures/profile';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validateProfile } from './schema';
import type { Profile } from './types';

const KEY = 'profile.v1';

export async function getProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {}
  const seeded = { ...profileSeed, updatedAtISO: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(seeded));
  return seeded;
}

export async function saveProfile(p: Profile): Promise<Profile> {
  const v = validateProfile(p);
  if (!v.success) {
    // Zod exposes `issues`, not `errors`
    throw new Error(v.error.issues?.[0]?.message ?? 'Invalid profile');
  }
  const toSave = { ...p, updatedAtISO: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(toSave));
  return toSave;
}
