// Header.tsx
import Avatar from "@/src/components/ui/Avatar";
import {
  selectEmail as selectAuthEmail,
  selectName as selectAuthName,
  useAuthStore,
} from "@/src/store/useAuthStore";
import { useProfileStore } from "@/src/store/useProfileStore";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

export default function Header() {
  const c = useThemeColors();
  const router = useRouter();

  // ── [A] Auth/profile display name (unchanged) ───────────────────────────────
  const authName = useAuthStore(selectAuthName);
  const authEmail = useAuthStore(selectAuthEmail);
  const rawName = useProfileStore((s) => s.profile?.Name ?? null);
  const rawEmail = useProfileStore((s) => s.profile?.Email ?? null);

  const welcomeLine = useMemo(() => {
    const primary =
      (authName && authName.trim()) || (rawName && rawName.trim()) || null;

    if (primary) {
      const first = primary.split(/\s+/)[0];
      return `Welcome, ${first}`;
    }
    const email = authEmail || rawEmail || null;
    if (email && email.includes("@")) return `Welcome, ${email.split("@")[0]}`;
    return "Welcome";
  }, [authName, authEmail, rawName, rawEmail]);

  // ── [B] Tracking store selectors (ADD: cross-platform health flags) ─────────
  const {
    // Android HC slice
    hcInitialized,
    hcAvailable,
    hcLoading,
    hcGrantedKeys,
    hcRefresh,
    hcGrantAll,
    hkRefresh,
    hcError,
    // iOS/Android cross-platform flags + action
    healthPlatform,
    healthAvailable,
    healthGranted,
    probeHealthPlatform,
  } = useTrackingStore();

  // ── [C] Status line & action button (UPDATED: iOS + Android) ────────────────
  const status = useMemo((): {
    label: string;
    tint: string;
    action?: "probe" | "grant" | "refresh" | "settings" | null;
  } => {
    // iOS → HealthKit
    if (Platform.OS === "ios") {
      if (healthAvailable === undefined || healthGranted === undefined) {
        return {
          label: "Connect Apple Health",
          tint: c.text.secondary,
          action: "probe",
        };
      }
      if (healthAvailable === false) {
        return {
          label: "HealthKit not available",
          tint: c.warning,
          action: null,
        };
      }
      if (!healthGranted) {
        return {
          label: "Permissions needed",
          tint: c.warning,
          action: "probe",
        };
      }

      return {
        label: "HealthKit: Connected",
        tint: c.success,
        action: "refresh",
      };
    }

    // Android → Health Connect
    if (Platform.OS === "android") {
      if (!hcInitialized) {
        return {
          label: "Preparing Health Connect…",
          tint: c.text.secondary,
          action: null,
        };
      }
      if (hcAvailable === false) {
        return {
          label: "Health Connect not available",
          tint: c.warning,
          action: null,
        };
      }
      const hasPerms = (hcGrantedKeys?.length ?? 0) > 0;
      if (!hasPerms) {
        return {
          label: "Permissions needed",
          tint: c.warning,
          action: "grant",
        };
      }
      if (hcLoading) {
        return { label: "Syncing…", tint: c.text.secondary, action: "refresh" };
      }
      if (hcError) {
        return {
          label: `Error: ${hcError}`,
          tint: "tomato",
          action: "refresh",
        };
      }
      return {
        label: "Health Connect: Connected",
        tint: c.success,
        action: "refresh",
      };
    }

    // fallback
    return { label: "Health not supported", tint: c.text.muted, action: null };
  }, [
    c,
    hcAvailable,
    hcError,
    hcGrantedKeys,
    hcInitialized,
    hcLoading,
    healthAvailable,
    healthGranted,
  ]);

  // ── [D] Primary action handler (ADD: iOS 'probe') ───────────────────────────
const onPrimaryAction = useCallback(async () => {
  if (status.action === "refresh") {
    if (Platform.OS === "ios") await hkRefresh();
    else await hcRefresh();
  }
  if (status.action === "grant") await hcGrantAll();
  if (status.action === "probe") await probeHealthPlatform();
}, [status.action, hkRefresh, hcRefresh, hcGrantAll, probeHealthPlatform]);

  const date = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View>
        <Text style={{ color: c.text.secondary, fontSize: 12 }}>{date}</Text>
        <Text
          style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}
        >
          {welcomeLine}
        </Text>

        {/* ── [E] Status line ─────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 4,
          }}
        >
          <Dot color={status.tint as string} />
          <Text style={{ color: c.text.muted, fontSize: 11 }}>
            {status.label}
          </Text>
        </View>
      </View>

      {/* ── [F] Actions + avatar ──────────────────────────────────────────── */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {status.action ? (
          <Pressable
            onPress={onPrimaryAction}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Ionicons
              name={
                status.action === "refresh"
                  ? "refresh-outline"
                  : status.action === "grant"
                    ? "key-outline"
                    : "pulse-outline" // iOS "probe" hint
              }
              size={20}
              color={c.text.secondary}
            />
          </Pressable>
        ) : null}
        <Avatar onPress={() => router.push("/profile")} />
      </View>
    </View>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
    />
  );
}
