// app/logout.tsx (simpler, no manual replace)
import { hkStopBackgroundObservers } from '@/src/services/tracking/healthkit';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useAuth } from '@clerk/clerk-expo';
import { useEffect } from 'react';
import { Platform } from 'react-native';
export default function LogoutScreen() {
  const { signOut } = useAuth();

  // useEffect(() => {
  //   (async () => {
  //     try { await signOut?.(); } finally {
  //       const clear = useAuthStore.getState().clear as () => Promise<void> | void;
  //       await clear?.();
  //       // No router.replace here; layout’s <SignedOut> will redirect to /auth/login
  //     }
  //   })();
  // }, [signOut]);

  useEffect(() => {
  (async () => {
    try {
      if (Platform.OS === 'ios') {
        try { await hkStopBackgroundObservers(); } catch {}
      }
      await signOut?.();            // Clerk sign-out
    } finally {
      const clear = useAuthStore.getState().clear as () => Promise<void> | void;
      await clear?.();
      // <SignedOut> in your layout will redirect to /auth/login
    }
  })();
}, [signOut]);

  return null;
}
