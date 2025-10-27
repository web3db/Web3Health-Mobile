// src/hooks/useOnFirstSignIn.ts
import { useAuth } from '@clerk/clerk-expo';
import { usePathname, useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { selectUserId, useAuthStore } from '../store/useAuthStore';

/**
 * Redirects a signed-in user with no stored userId to /auth/register.
 * - Waits for navigator to be ready
 * - No-op if already at target
 * - Debounced to avoid repeats
 */
export function useOnFirstSignIn() {
  const { isSignedIn } = useAuth(); // boolean | undefined while hydrating
  const router = useRouter();
  const pathname = usePathname();
  const navState = useRootNavigationState(); // truthy key => nav ready
  const userId = useAuthStore(selectUserId);

  // Typed route literals (satisfy Href)
  const LOGIN: Href = '/auth/login';
  const REGISTER: Href = '/auth/register';
  const HOME: Href = '/';

  const lastReplacedRef = useRef<Href | null>(null);

  useEffect(() => {
    if (!navState?.key) return;           // wait for navigator
    if (isSignedIn === undefined) return; // wait for Clerk

    const onLogin = pathname?.startsWith('/auth/login') ?? false;
    const onRegister = pathname?.startsWith('/auth/register') ?? false;
    const inAuth = onLogin || onRegister;

    let nextPath: Href | null = null;

    if (!isSignedIn) {
      nextPath = onLogin ? null : LOGIN;
    } else if (userId == null) {
      nextPath = onRegister ? null : REGISTER;
    } else {
      nextPath = inAuth ? HOME : null;
    }

    // No-op if nothing to do or already there
    if (!nextPath || nextPath === pathname) {
      lastReplacedRef.current = null;
      return;
    }
    // Debounce same target
    if (lastReplacedRef.current === nextPath) return;

    lastReplacedRef.current = nextPath;
    router.replace(nextPath);
  }, [isSignedIn, userId, pathname, navState?.key, router, LOGIN, REGISTER, HOME]);
}
