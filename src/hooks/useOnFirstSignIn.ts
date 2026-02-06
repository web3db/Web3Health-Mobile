// src/hooks/useOnFirstSignIn.ts
// import { registerExpoPushToken } from "@/src/services/notifications/push";
import { useAuth, useUser } from "@clerk/clerk-expo";
import {
  usePathname,
  useRootNavigationState,
  useRouter,
  type Href,
} from "expo-router";
import { useEffect, useRef } from "react";
import { selectUserId, useAuthStore } from "../store/useAuthStore";

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
  const { user } = useUser();
  // const didRegisterPushRef = useRef(false);

  // Typed route literals (satisfy Href)
  const LOGIN: Href = "/auth/login";
  const REGISTER: Href = "/auth/register";
  const HOME: Href = "/";

  const lastReplacedRef = useRef<Href | null>(null);

  useEffect(() => {
    if (!navState?.key) return; // wait for navigator
    if (isSignedIn === undefined) return; // wait for Clerk

    const onLogin = pathname?.startsWith("/auth/login") ?? false;
    const onRegister = pathname?.startsWith("/auth/register") ?? false;
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
  }, [
    isSignedIn,
    userId,
    pathname,
    navState?.key,
    router,
    LOGIN,
    REGISTER,
    HOME,
  ]);

  // // Register Expo push token once after successful sign-in + backend user exists
  // useEffect(() => {
  //   if (__DEV__)
  //     console.log("[push] effect check", {
  //       navReady: !!navState?.key,
  //       isSignedIn,
  //       userId,
  //       clerkId: user?.id ?? null,
  //     });
  //   if (!navState?.key) return;
  //   if (isSignedIn !== true) return;
  //   if (userId == null) return;

  //   const clerkId = user?.id ?? null;
  //   if (!clerkId) return;

  //   if (didRegisterPushRef.current) return;
  //   didRegisterPushRef.current = true;

  //   registerExpoPushToken({ clerkId })
  //     .then((r) => {
  //       if (__DEV__) console.log("[push] register result", r);
  //     })
  //     .catch((e) => {
  //       didRegisterPushRef.current = false; // allow retry next launch
  //       console.warn("[push] register failed", e);
  //     });
  // }, [navState?.key, isSignedIn, userId, user?.id]);
}
