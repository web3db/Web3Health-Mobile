// app/logout.tsx (simpler, no manual replace)
import { useAuthStore } from '@/src/store/useAuthStore';
import { useAuth } from '@clerk/clerk-expo';
import { useEffect } from 'react';

export default function LogoutScreen() {
  const { signOut } = useAuth();

  useEffect(() => {
    (async () => {
      try { await signOut?.(); } finally {
        const clear = useAuthStore.getState().clear as () => Promise<void> | void;
        await clear?.();
        // No router.replace here; layout’s <SignedOut> will redirect to /auth/login
      }
    })();
  }, [signOut]);

  return null;
}
