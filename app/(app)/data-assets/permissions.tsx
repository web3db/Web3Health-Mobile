//app/(app)/data-assets/permissions.tsx
import SettingsCoach from "@/src/components/overlay/SettingsCoach";
import { openAppSettings } from "@/src/services/navigation/linking";
import { useTrackingStore } from "@/src/store/useTrackingStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useEffect } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PermissionsScreen() {
  const c = useThemeColors();
  const {
    // ANDROID
    hcInitialize,
    hcGrantAll,
    hcOpenSettings,
    hcRefresh,
    hcGrantedKeys,
    hcError,
    hcInitialized,
    hcAvailable,
    hcLoading,

    // iOS
    initHealthKitIfNeeded,
    refreshHealthKitData,
    handleHealthPermissionPress,
    handleHealthSettingsReturn,
    hkActiveMetrics,
    hkError,
    hkLoading,

    // Cross-platform
    healthAvailable,
    healthGranted,
  } = useTrackingStore();

  const [showCoach, setShowCoach] = React.useState(false);

  // Android: initialize HC once, then refresh
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      try {
        if (!hcInitialized) {
          await hcInitialize();
        }
        const availableNow = hcAvailable;
        const hasAny = (hcGrantedKeys?.length ?? 0) > 0;
        // Only refresh if HC is available and we already have some grants
        if (availableNow && hasAny) {
          await hcRefresh();
        }
      } catch (e) {
        console.log(
          "[Permissions] Android init/refresh error:",
          (e as any)?.message ?? e
        );
        /* surfaced via hcError */
      }
    })();
    // Re-run when init state, availability, or granted keys change
  }, [hcInitialized, hcAvailable, hcGrantedKeys, hcInitialize, hcRefresh]);

  // iOS: silent init + data hydrate (no prompts)
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    (async () => {
      try {
        await initHealthKitIfNeeded();
        if (healthAvailable && healthGranted) {
          await refreshHealthKitData();
        }
      } catch {
        /* surfaced via hkError */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android: re-check on focus (silent). If already granted, refresh datasets.
  // iOS: reconcile after returning from Settings; refresh data accordingly.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          if (Platform.OS === "android") {
            const hasAny = (hcGrantedKeys?.length ?? 0) > 0;
            if (hcAvailable && hasAny) {
              await hcRefresh();
            }
            return;
          }

          if (Platform.OS === "ios") {
            await handleHealthSettingsReturn();
            return;
          }
        } catch (e) {
          console.log(
            "[Permissions] focus refresh error:",
            (e as any)?.message ?? e
          );
        }
      })();
    }, [hcAvailable, hcGrantedKeys, hcRefresh, handleHealthSettingsReturn])
  );

  const isAndroid = Platform.OS === "android";

  // Availability & status labels
  const available = isAndroid ? hcAvailable : healthAvailable;
  const grantedCount = isAndroid
    ? (hcGrantedKeys?.length ?? 0)
    : (hkActiveMetrics?.length ?? 0);

  const statusLabel = isAndroid
    ? !hcInitialized
      ? "Initializing…"
      : available
        ? "Health Connect ready"
        : "Health Connect unavailable"
    : available
      ? healthGranted
        ? "Apple Health ready"
        : "Apple Health detected"
      : "Apple Health unavailable";

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: c.bg }}
    >
      <SettingsCoach
        visible={Platform.OS === "ios" && showCoach}
        onRequestClose={() => setShowCoach(false)}
        onOpen={async () => {
          try {
            await openAppSettings();
          } finally {
            setShowCoach(false);
          }
        }}
        autoOpen={false}
        appDisplayName="Web3Health"
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Header
          title="Permissions"
          subtitle="Control what data you allow — you’re in charge."
        />

        <Card>
          <Row>
            <Badge tone={available ? "success" : "warning"}>
              {statusLabel}
            </Badge>
            <Badge>
              {grantedCount} {isAndroid ? "grants" : "active"}
            </Badge>
          </Row>

          <Text style={{ color: c.text.secondary, marginTop: 10 }}>
            Web3Health treats your health signals as data assets. Grant only
            what you want to package and share with buyers. You can revoke
            access any time in
            {isAndroid
              ? " Health Connect settings."
              : " iOS Settings → Health."}
          </Text>

          <Row style={{ marginTop: 14 }}>
            {isAndroid ? (
              available ? (
                <>
                  <PrimaryButton
                    label="Grant all read permissions"
                    onPress={hcGrantAll}
                  />
                  <GhostButton
                    label={hcLoading ? "Refreshing…" : "Refresh"}
                    onPress={hcRefresh}
                  />
                  <GhostButton
                    label="Open Health Connect"
                    onPress={hcOpenSettings}
                  />
                </>
              ) : (
                <>
                  <PrimaryButton
                    label="Open Health Connect"
                    onPress={hcOpenSettings}
                  />
                  <GhostButton label="Refresh" onPress={hcRefresh} />
                </>
              )
            ) : (
              // iOS actions
              <>
                <PrimaryButton
                  label="Grant all read permissions"
                  onPress={async () => {
                    try {
                      await handleHealthPermissionPress();

                      // Re-read latest cross-platform flags from the store
                      const {
                        healthAvailable: latestAvailable,
                        healthGranted: latestGranted,
                      } = useTrackingStore.getState();

                      if (!latestAvailable || !latestGranted) {
                        // Still not in a good state after the permission flow:
                        // route the user to Settings via the coach.
                        setShowCoach(true);
                      }
                      // Otherwise, the store's HealthKit pipeline has already refreshed datasets.
                    } catch {
                      // Errors are surfaced via hkError / header status.
                    }
                  }}
                />
                <GhostButton
                  label={hkLoading ? "Refreshing…" : "Refresh"}
                  onPress={refreshHealthKitData}
                />
                <GhostButton
                  label="Open Health"
                  onPress={() => setShowCoach(true)}
                />
              </>
            )}
          </Row>

          {hcError || hkError ? (
            <Text style={{ color: "tomato", marginTop: 10 }}>
              Error: {hcError ?? hkError}
            </Text>
          ) : null}
        </Card>

        <Card style={{ marginTop: 16 }}>
          <Text
            style={{ color: c.text.primary, fontSize: 16, fontWeight: "800" }}
          >
            What we may request
          </Text>
          <Text style={{ color: c.text.secondary, marginTop: 6 }}>
            Steps, Floors climbed, Distance, Active calories, Heart rate, Sleep,
            Weight, Respiratory rate. Read-only. We never write to your health
            data.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const c = useThemeColors();
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 }}>
      <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: "900" }}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: c.text.secondary, marginTop: 4 }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function Card({ children, style }: React.PropsWithChildren<{ style?: any }>) {
  const c = useThemeColors();
  return (
    <View
      style={[
        {
          marginHorizontal: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.surface,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Row({ children, style }: React.PropsWithChildren<{ style?: any }>) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Badge({
  children,
  tone,
}: React.PropsWithChildren<{ tone?: "success" | "warning" }>) {
  const c = useThemeColors();
  const bg =
    tone === "success" ? c.success : tone === "warning" ? c.warning : c.muted;
  const color = tone ? c.text.inverse : c.text.primary;
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: bg,
      }}
    >
      <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{children}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void | Promise<void>;
}) {
  const c = useThemeColors();
  return (
    <Text
      onPress={() => void onPress()}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: c.primary,
        color: c.text.inverse,
        fontWeight: "800",
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}

function GhostButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void | Promise<void>;
}) {
  const c = useThemeColors();
  return (
    <Text
      onPress={() => void onPress()}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.border,
        color: c.text.primary,
        fontWeight: "800",
        overflow: "hidden",
      }}
    >
      {label}
    </Text>
  );
}
