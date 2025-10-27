import { useAuthStore } from '@/src/store/useAuthStore';
import { useProfileStore } from '@/src/store/useProfileStore';
import { useMemo } from 'react';

/**
 * Returns the best-known numeric UserId, or null if not available yet.
 * Prefers the auth store’s userId, then falls back to profile.UserId.
 */
export function useCurrentUserId(): number | null {
  const authUserId = useAuthStore((s) => s.userId ?? null);
  const profileUserId = useProfileStore((s) => s.profile?.UserId ?? null);

  return useMemo(() => {
    if (typeof authUserId === 'number') return authUserId;
    if (typeof profileUserId === 'number') return profileUserId;
    return null;
  }, [authUserId, profileUserId]);
}
