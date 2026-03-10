// app/index.tsx
import {
  fetchLoginProfileByClerkId,
  type LoginProfileResult,
} from "@/src/services/auth/api";
import {
  selectHydrated,
  selectUserId,
  useAuthStore,
} from "@/src/store/useAuthStore";
// import { useShareStore } from "@/src/store/useShareStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export default function Gate() {
  const c = useThemeColors();
  const { isLoaded, isSignedIn, userId: clerkUserId } = useAuth();
  const userId = useAuthStore(selectUserId);
  const hydrated = useAuthStore(selectHydrated);

  const [status, setStatus] = React.useState<
    "booting" | "checking_profile" | "needs_register" | "error"
  >("booting");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
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
    if (!isLoaded || !hydrated) {
      setStatus("booting");
      setErrorMessage(null);
      return;
    }

    if (!isSignedIn) {
      setStatus("booting");
      setErrorMessage(null);
      return;
    }

    if (userId != null) {
      setStatus("booting");
      setErrorMessage(null);
      return;
    }

    if (!clerkUserId) {
      console.log("[Gate] waiting_for_clerk_user_id");
      setStatus("booting");
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    setStatus("checking_profile");
    setErrorMessage(null);

    (async () => {
      try {
        console.log("[Gate] profile_lookup_start", { clerkUserId });

        const result: LoginProfileResult =
          await fetchLoginProfileByClerkId(clerkUserId);

        if (cancelled) return;

        console.log("[Gate] profile_lookup_result", {
          kind: result.kind,
          clerkUserId,
        });

        if (result.kind === "ok") {
          const u = result.user;

          useAuthStore.getState().setAuth({
            userId: u.UserId ?? null,
            email: u.Email ?? null,
            name: u.Name ?? null,
          });

          console.log("[Gate] profile_lookup_ok", {
            clerkUserId,
            userId: u.UserId ?? null,
          });

          setStatus("booting");
          return;
        }

        if (result.kind === "not_found") {
          console.log("[Gate] profile_lookup_not_found_redirect_register", {
            clerkUserId,
          });
          setStatus("needs_register");
          return;
        }

        console.warn("[Gate] profile_lookup_error_response", { clerkUserId });
        setErrorMessage(
          "We could not verify your Web3Health profile right now. Please try again.",
        );
        setStatus("error");
      } catch (e) {
        if (cancelled) return;

        console.warn("[Gate] profile_lookup_failed", e);
        setErrorMessage(
          "We could not load your account right now. Please try again.",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, hydrated, isSignedIn, clerkUserId, userId, reloadKey]);

  console.log("[Gate] render", {
    isLoaded,
    hydrated,
    isSignedIn,
    clerkUserId,
    userId,
    status,
    hasError: !!errorMessage,
  });

  if (!isLoaded || !hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          backgroundColor: c.bg,
        }}
      >
        <ActivityIndicator />
        <Text
          style={{
            marginTop: 14,
            color: c.text.primary,
            fontSize: 16,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Checking your session
        </Text>
        <Text
          style={{
            marginTop: 8,
            color: c.text.secondary,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          Please wait while we prepare your account.
        </Text>
      </View>
    );
  }

  if (!isSignedIn) {
    console.log("[Gate] redirect_login");
    return <Redirect href="/auth/login" />;
  }

  if (userId != null) {
    console.log("[Gate] redirect_app", { userId });
    return <Redirect href="/(app)/(tabs)" />;
  }

  if (status === "needs_register") {
    console.log("[Gate] redirect_register", { clerkUserId });
    return <Redirect href="/auth/register" />;
  }

  if (status === "error") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
          backgroundColor: c.bg,
        }}
      >
        <Text
          style={{
            color: c.text.primary,
            fontSize: 20,
            fontWeight: "800",
            textAlign: "center",
          }}
        >
          We could not load your account
        </Text>

        <Text
          style={{
            marginTop: 10,
            color: c.text.secondary,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
          }}
        >
          {errorMessage ??
            "Please try again. You are still signed in, and we will not log you out."}
        </Text>

        <Pressable
          onPress={() => {
            console.log("[Gate] retry_profile_lookup");
            setReloadKey((prev) => prev + 1);
          }}
          style={{
            marginTop: 18,
            minWidth: 180,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.primary,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
        backgroundColor: c.bg,
      }}
    >
      <ActivityIndicator />
      <Text
        style={{
          marginTop: 14,
          color: c.text.primary,
          fontSize: 16,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        Loading your account
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: c.text.secondary,
          fontSize: 14,
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        Please wait while we check your Web3Health profile.
      </Text>
    </View>
  );
}
