// [COACH-0] SettingsCoach: brief, in-app guidance shown BEFORE we jump to Settings.
// - No external deps; React Native only.
// - Optional auto-open and auto-dismiss timers.
// - Meant to be invoked right before Linking.openSettings().
//
// Usage (example):
//   <SettingsCoach
//     visible={showCoach}
//     onRequestClose={() => setShowCoach(false)}
//     onOpen={() => openAppSettings()}            // call your helper
//     autoOpen                                  // show for a beat, then open Settings
//     openDelayMs={900}                         // default 900ms
//     autoDismissMs={8000}                      // optional: hide after 8s
//   />

import React, { useEffect, useMemo, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onOpen?: () => void;             // [COACH-1] Parent will actually open Settings.
  onRequestClose?: () => void;     // [COACH-2] Close overlay (backdrop tap or timer).
  autoOpen?: boolean;              // [COACH-3] If true, call onOpen after delay.
  openDelayMs?: number;            // default 900
  autoDismissMs?: number;          // optional, e.g., 8000
  // Optional copy overrides
  title?: string;
  stepsTitle?: string;
  appDisplayName?: string;         // defaults to "Web3Health"
};

export default function SettingsCoach({
  visible,
  onOpen,
  onRequestClose,
  autoOpen = false,
  openDelayMs = 900,
  autoDismissMs,
  title = "Allow Health permissions",
  stepsTitle = "Follow these steps:",
  appDisplayName = "Web3Health",
}: Props) {
  // [COACH-4] Pulsing dot animation for visual emphasis.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  // [COACH-5] Announce for screen readers when opened.
  useEffect(() => {
    if (visible) {
      AccessibilityInfo.announceForAccessibility?.(
        "Opening Settings guidance. You can close this overlay."
      );
    }
  }, [visible]);

  // [COACH-6] Auto-open Settings after a brief beat so users see the guidance first.
  useEffect(() => {
    if (!visible || !autoOpen || !onOpen) return;
    const t = setTimeout(() => {
      onOpen();
    }, Math.max(0, openDelayMs));
    return () => clearTimeout(t);
  }, [visible, autoOpen, openDelayMs, onOpen]);

  // [COACH-7] Optional auto-dismiss for long-lived screens.
  useEffect(() => {
    if (!visible || !autoDismissMs || !onRequestClose) return;
    const t = setTimeout(() => onRequestClose(), Math.max(0, autoDismissMs));
    return () => clearTimeout(t);
  }, [visible, autoDismissMs, onRequestClose]);

  const dotStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pulse.interpolate({
            inputRange: [0, 1],
            outputRange: [0.85, 1.15],
          }),
        },
      ],
      opacity: pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.7, 1],
      }),
    }),
    [pulse]
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      {/* [COACH-8] Backdrop */}
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close guidance overlay"
        onPress={onRequestClose}
      >
        {/* Prevent clicks from falling through */}
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            {/* Title */}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              We’ll open your app’s Settings. Enable the metrics you want, then
              return here.
            </Text>

            {/* Steps */}
            <Text style={styles.stepsTitle}>{stepsTitle}</Text>
            <View style={styles.steps}>
              <Step n={1} text="Open Settings" />
              <Step n={2} text="Privacy & Security" />
              <Step n={3} text="Health → Apps" />
              <Step
                n={4}
                text={`${appDisplayName} → Allow the metrics`}
                trailingDot={
                  <Animated.View style={[styles.dot, dotStyle]} />
                }
              />
            </View>

            {/* Actions (optional): keep only the primary since we auto-open */}
            <View style={styles.actions}>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => onOpen?.()}
                accessibilityRole="button"
                accessibilityLabel="Open app settings now"
              >
                <Text style={styles.primaryText}>Open Settings</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryBtn}
                onPress={onRequestClose}
                accessibilityRole="button"
                accessibilityLabel="Dismiss guidance overlay"
              >
                <Text style={styles.secondaryText}>Not now</Text>
              </Pressable>
            </View>
          </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

// [COACH-9] Small numbered step row.
function Step({
  n,
  text,
  trailingDot,
}: {
  n: number;
  text: string;
  trailingDot?: React.ReactNode;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
      {trailingDot ? <View style={styles.dotWrap}>{trailingDot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  safeArea: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "#101214",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.08)",
  },
  title: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    lineHeight: 20,
  },
  stepsTitle: {
    marginTop: 14,
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "600",
  },
  steps: {
    marginTop: 8,
    gap: 8,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "800",
  },
  stepText: {
    color: "white",
    fontSize: 14,
    flexShrink: 1,
  },
  dotWrap: {
    marginLeft: 8,
    width: 10,
    height: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "white",
  },
  actions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  primaryText: {
    color: "#101214",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  secondaryText: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
    fontSize: 14,
  },
});
