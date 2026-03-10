// app/(app)/auth/reset-required.tsx
import Button from "@/src/components/ui/Button";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { SignedIn, SignedOut, useSession, useUser } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ResetRequiredScreen() {
  const c = useThemeColors();
  const router = useRouter();

  const { user, isLoaded: userLoaded } = useUser();
  const { session, isLoaded: sessionLoaded } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // We can’t confirm the exact field name here due to docs fetch errors,
  // so we check a couple of common shapes and log for verification.
  const resetTaskDetected = useMemo(() => {
    const task = (session as any)?.currentTask;
    const key = task?.key ?? task?.name ?? task;

    return key === "reset-password";
  }, [session]);

  useEffect(() => {
    if (!sessionLoaded) return;

    const task = (session as any)?.currentTask;
    // Log once so you can confirm the exact shape in your version.
    console.log("[ResetRequired] session.currentTask =", task);

    // If there is no reset-password task, do not keep the user here.
    if (session && !resetTaskDetected) {
      router.replace("/");
    }
  }, [sessionLoaded, session, resetTaskDetected, router]);

  const onSubmit = async () => {
    if (!userLoaded || !user || submitting) return;

    if (!currentPassword) {
      Alert.alert(
        "Missing current password",
        "Please enter your current password.",
      );
      return;
    }
    if (!newPassword) {
      Alert.alert("Missing new password", "Please enter a new password.");
      return;
    }
    if (!confirmNewPassword) {
      Alert.alert("Confirm password", "Please confirm your new password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert(
        "Passwords do not match",
        "Please make sure both new passwords match.",
      );
      return;
    }

    setSubmitting(true);
    try {
      // Clerk’s Core 2 Expo upgrade notes this method requires the current password
      // plus the new password. If your Clerk version differs, the error message
      // will indicate what fields are missing.
      await user.updatePassword({
        currentPassword,
        newPassword,
      });

      Alert.alert(
        "Password updated",
        "Your password has been updated. You can continue.",
      );

      // After password update, Clerk should clear the reset-password task.
      // Send them home; your app flow will proceed normally.
      router.replace("/");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "Could not update password. Please try again.";
      Alert.alert("Update failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <SignedOut>
        {/* If the user isn't signed in, they can't have a session task. */}
        <View
          style={{ flex: 1, justifyContent: "center", padding: 16, gap: 12 }}
        >
          <Text
            style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}
          >
            Please sign in
          </Text>
          <Text style={{ color: c.text.secondary, fontSize: 14 }}>
            You need to sign in to continue.
          </Text>
          <Button
            title="Go to login"
            onPress={() => router.replace("/auth/login")}
          />
        </View>
      </SignedOut>

      <SignedIn>
        <View style={{ flex: 1, padding: 20, gap: 14 }}>
          <View style={{ gap: 6, marginTop: 8 }}>
            <Text
              style={{ color: c.text.primary, fontSize: 26, fontWeight: "900" }}
            >
              Reset required
            </Text>
            <Text style={{ color: c.text.secondary, fontSize: 14 }}>
              For security, you need to reset your password before continuing.
            </Text>
          </View>

          {/* Current password */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: c.elevated,
              borderColor: c.muted,
              borderWidth: 1.5,
              borderRadius: 12,
              paddingHorizontal: 12,
              height: 56,
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={c.text.secondary}
              style={{ marginRight: 8 }}
              accessible={false}
              importantForAccessibility="no"
            />
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={c.text.muted}
              secureTextEntry={!showCurrent}
              editable={!submitting}
              style={{ flex: 1, color: c.text.primary, fontSize: 16 }}
            />
            <Pressable
              onPress={() => setShowCurrent((p) => !p)}
              disabled={submitting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                showCurrent ? "Hide current password" : "Show current password"
              }
            >
              <Ionicons
                name={showCurrent ? "eye-off" : "eye"}
                size={20}
                color={c.text.secondary}
                accessible={false}
                importantForAccessibility="no"
              />
            </Pressable>
          </View>

          {/* New password */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: c.elevated,
              borderColor: c.muted,
              borderWidth: 1.5,
              borderRadius: 12,
              paddingHorizontal: 12,
              height: 56,
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={c.text.secondary}
              style={{ marginRight: 8 }}
              accessible={false}
              importantForAccessibility="no"
            />
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor={c.text.muted}
              secureTextEntry={!showNew}
              editable={!submitting}
              style={{ flex: 1, color: c.text.primary, fontSize: 16 }}
            />
            <Pressable
              onPress={() => setShowNew((p) => !p)}
              disabled={submitting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                showNew ? "Hide new password" : "Show new password"
              }
            >
              <Ionicons
                name={showNew ? "eye-off" : "eye"}
                size={20}
                color={c.text.secondary}
                accessible={false}
                importantForAccessibility="no"
              />
            </Pressable>
          </View>

          {/* Confirm new password */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: c.elevated,
              borderColor: c.muted,
              borderWidth: 1.5,
              borderRadius: 12,
              paddingHorizontal: 12,
              height: 56,
            }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={c.text.secondary}
              style={{ marginRight: 8 }}
              accessible={false}
              importantForAccessibility="no"
            />
            <TextInput
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              placeholder="Confirm new password"
              placeholderTextColor={c.text.muted}
              secureTextEntry={!showConfirm}
              editable={!submitting}
              style={{ flex: 1, color: c.text.primary, fontSize: 16 }}
            />
            <Pressable
              onPress={() => setShowConfirm((p) => !p)}
              disabled={submitting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                showConfirm ? "Hide confirm password" : "Show confirm password"
              }
            >
              <Ionicons
                name={showConfirm ? "eye-off" : "eye"}
                size={20}
                color={c.text.secondary}
                accessible={false}
                importantForAccessibility="no"
              />
            </Pressable>
          </View>

          <View style={{ marginTop: 6, gap: 10 }}>
            <Button
              title={submitting ? "Updating…" : "Update password"}
              onPress={onSubmit}
              disabled={submitting || !sessionLoaded}
            />

            {/* Optional: allow them to sign out instead of proceeding */}
            <Text style={{ color: c.text.muted, fontSize: 12 }}>
              Your account requires a password update before you can continue.
            </Text>
          </View>
        </View>
      </SignedIn>
    </SafeAreaView>
  );
}
