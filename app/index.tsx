import {
  fetchLoginProfileByClerkId,
  type LoginProfileResult
} from "@/src/services/auth/api";
import {
  selectHydrated,
  selectUserId,
  useAuthStore,
} from "@/src/store/useAuthStore";
// import { useShareStore } from "@/src/store/useShareStore";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React from "react";

export default function Gate() {
  const { isLoaded, isSignedIn, userId: clerkUserId, signOut } = useAuth();
  const userId = useAuthStore(selectUserId);
  const hydrated = useAuthStore(selectHydrated);

  // Local flags so we only run the rehydrate flow once per mount
  const [attemptedRehydrate, setAttemptedRehydrate] = React.useState(false);
  const [rehydrating, setRehydrating] = React.useState(false);

  // const [attemptedShareHydrate, setAttemptedShareHydrate] =
  //   React.useState(false);
  // const [shareHydrating, setShareHydrating] = React.useState(false);

  // ────────────────────────────────────────────────────────────────
  // Rehydrate MST_User when:
  // - Clerk is loaded
  // - auth store is hydrated
  // - user is signed in
  // - but useAuthStore.userId is still null
  // ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!isLoaded || !hydrated) return;
    if (!isSignedIn) return;
    if (userId != null) return; // already have backend user
    if (attemptedRehydrate) return;

    setAttemptedRehydrate(true);

    // If Clerk says "signed in" but doesn't give us a userId,
    // treat it as an inconsistent state → hard reset to login.
    if (!clerkUserId) {
      (async () => {
        try {
          await signOut();
        } catch {}
        useAuthStore.getState().clear();
      })();
      return;
    }

    setRehydrating(true);

    (async () => {
      try {
        const result: LoginProfileResult =
          await fetchLoginProfileByClerkId(clerkUserId);

        if (result.kind === "ok") {
          const u = result.user;
          // Hydrate the local auth store with MST_User row
          useAuthStore.getState().setAuth({
            userId: u.UserId ?? null,
            email: u.Email ?? null,
            name: u.Name ?? null,
          });
        } else {
          // USER_NOT_FOUND or generic error → sign out and reset
          try {
            await signOut();
          } catch {}
          useAuthStore.getState().clear();
        }
      } catch {
        // Network or unexpected error → safest is to reset to login
        try {
          await signOut();
        } catch {}
        useAuthStore.getState().clear();
      } finally {
        setRehydrating(false);
      }
    })();
  }, [
    isLoaded,
    hydrated,
    isSignedIn,
    userId,
    clerkUserId,
    attemptedRehydrate,
    signOut,
  ]);

  // ────────────────────────────────────────────────────────────────
  // Rehydrate share store when:
  // - Clerk + auth store are hydrated
  // - user is signed in
  // - MST_User userId is known (non-null)
  // This runs once per mount per login.
  // ────────────────────────────────────────────────────────────────

  // React.useEffect(() => {
  //   if (__DEV__) {
  //     console.log("[Gate] shareHydrate effect check", {
  //       isLoaded,
  //       hydrated,
  //       isSignedIn,
  //       userId,
  //       attemptedShareHydrate,
  //     });
  //   }

  //   if (!isLoaded || !hydrated) return;
  //   if (!isSignedIn) return;
  //   if (userId == null) return; // need MST_User userId
  //   if (attemptedShareHydrate) return;

  //   setAttemptedShareHydrate(true);
  //   setShareHydrating(true);

  //   (async () => {
  //     try {
  //       if (__DEV__) {
  //         console.log("[Gate] shareHydrate → fetchUserLoginShareHydration", {
  //           userId,
  //         });
  //       }

  //       const payload = await fetchUserLoginShareHydration(userId);

  //       if (__DEV__) {
  //         console.log("[Gate] shareHydrate → payload received", {
  //           userId,
  //           sessionCount: payload?.sessions?.length ?? 0,
  //         });
  //       }

  //       useShareStore.getState().hydrateFromServer(payload);

  //       if (__DEV__) {
  //         console.log("[Gate] shareHydrate → hydrateFromServer done", {
  //           userId,
  //         });
  //       }
  //     } catch (e) {
  //       if (__DEV__) {
  //         console.warn(
  //           "[Gate] share-store hydration failed",
  //           (e as any)?.message ?? e
  //         );
  //       }
  //       // Do NOT sign the user out; app can still run without hydrated share store.
  //     } finally {
  //       setShareHydrating(false);
  //       if (__DEV__) {
  //         console.log("[Gate] shareHydrate → complete", { userId });
  //       }
  //     }
  //   })();
  // }, [isLoaded, hydrated, isSignedIn, userId, attemptedShareHydrate]);

  // ────────────────────────────────────────────────────────────────
  // Rendering logic
  // ────────────────────────────────────────────────────────────────

  // Still waiting for Clerk or zustand hydration → show nothing
  if (!isLoaded || !hydrated) return null;

  // Not signed in at all → go to login
  if (!isSignedIn) {
    return <Redirect href="/auth/login" />;
  }

  // Signed in, but we don't yet know the MST_User (rehydration in progress)
  if (userId == null) {
    // We could show a loader here if you prefer, but null keeps splash minimal.
    // e.g. return <LoadingScreen message="Checking your profile…" />;
    return null;
  }

  // Normal case: signed in + MST_User present → go to app tabs
  // console.log("Gate", {
  //   isLoaded,
  //   isSignedIn,
  //   hydrated,
  //   userId,
  //   rehydrating,
  //   shareHydrating,
  // });
  console.log("Gate", {
    isLoaded,
    isSignedIn,
    hydrated,
    userId,
    rehydrating,
  });

  return <Redirect href="/(app)/(tabs)" />;
}
