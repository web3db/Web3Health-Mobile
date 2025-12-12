// app/auth/login.tsx
import Button from "@/src/components/ui/Button";
import {
  fetchUserLoginShareHydration,
  lookupUserByEmail,
} from "@/src/services/auth/api";
import { getUserProfile } from "@/src/services/profile/api";
import { useAuthStore } from "@/src/store/useAuthStore";
import { useProfileStore } from "@/src/store/useProfileStore";
import { useShareStore } from "@/src/store/useShareStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { SignedIn, SignedOut, useSignIn, useSignUp } from "@clerk/clerk-expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Mode = "signIn" | "signUp";

export default function LoginScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const passwordRef = useRef<TextInput | null>(null);
  const colorScheme = useColorScheme();
  const logoSource =
    c.bg === "#0B0B0B"
      ? require("../../../assets/images/Web3Health-dark.png")
      : require("../../../assets/images/Web3Health-light.png");
  const {
    signIn,
    isLoaded: signInLoaded,
    setActive: setActiveSignIn,
  } = useSignIn();
  const {
    signUp,
    isLoaded: signUpLoaded,
    setActive: setActiveSignUp,
  } = useSignUp();

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Email verification (sign-up) state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");
  // Password reset (sign-in) state
  const [resetStep, setResetStep] = useState<"none" | "request" | "verify">(
    "none"
  );
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Second factor (Client Trust) state for sign-in
  const [secondFactorStep, setSecondFactorStep] = useState<"none" | "verify">(
    "none"
  );
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorEmailAddressId, setSecondFactorEmailAddressId] = useState<
    string | null
  >(null);

  let headerTitle = "";
  let headerSubtitle = "";
  if (mode === "signIn" && secondFactorStep === "verify") {
    headerTitle = "Verification needed";
    headerSubtitle =
      "Enter the verification code we sent to your email to finish signing in.";
  } else if (mode === "signIn" && resetStep === "none") {
    headerTitle = "Sign in";
    headerSubtitle = "Enter your email and password to sign in.";
  } else if (mode === "signIn" && resetStep === "request") {
    headerTitle = "Reset your password";
    headerSubtitle =
      "Enter the email that you used for Web3Health so that we can send a reset code.";
  } else if (mode === "signIn" && resetStep === "verify") {
    headerTitle = "Enter reset code";
    headerSubtitle =
      "Check your email for the reset code and choose a new password.";
  } else if (mode === "signUp" && !pendingVerification) {
    headerTitle = "Create your account";
    headerSubtitle =
      "Enter your email and a secure password to create your Web3Health account.";
  } else if (mode === "signUp" && pendingVerification) {
    headerTitle = "Verify your email address";
    headerSubtitle =
      "Enter the verification code that we sent to your email to finish creating your account.";
  } else {
    headerTitle = "Sign in";
    headerSubtitle = "Enter your email and password to continue.";
  }

  // // After Clerk session is active, resolve userId+name and stash to auth
  // const goAfterAuth = useCallback(
  //   async (rawEmail: string) => {
  //     try {
  //       const normEmail = rawEmail.trim().toLowerCase();

  //       // 1) Lightweight lookup
  //       const found = await lookupUserByEmail(normEmail);
  //       if (!found) {
  //         router.replace("/auth/register");
  //         return;
  //       }
  //       const { userId, name: nameFromLookup } = found;

  //       // 2) Kick off full profile fetch in parallel
  //       const profilePromise = getUserProfile(userId);

  //       // 3) Seed auth immediately so Header shows name right away
  //       //    (auth store is upgraded to include "name")
  //       const authApi = useAuthStore.getState() as any;
  //       if (typeof authApi.setAuth === "function") {
  //         authApi.setAuth({
  //           userId,
  //           email: normEmail,
  //           name: nameFromLookup ?? null,
  //         });
  //       } else if (typeof authApi.setUser === "function") {
  //         // older API compatibility
  //         authApi.setUser({
  //           UserId: userId,
  //           Email: normEmail,
  //           Name: nameFromLookup ?? null,
  //         });
  //       }

  //       // 4) Clear stale profile (optional), then hydrate with the fetched one
  //       useProfileStore.getState().setProfile(null);
  //       const user = await profilePromise;

  //       // If lookup didn't have a name, also backfill auth.name from profile.Name
  //       if (!nameFromLookup && typeof authApi.setAuth === "function") {
  //         authApi.setAuth({
  //           userId,
  //           email: normEmail,
  //           name: user?.Name ?? null,
  //         });
  //       }

  //       useProfileStore.getState().setProfile(user);

  //       // 5) Navigate home
  //       router.replace("/");
  //     } catch (err: any) {
  //       Alert.alert(
  //         "Login error",
  //         err?.message ?? "Something went wrong. Please try again."
  //       );
  //     }
  //   },
  //   [router]
  // );
  // After Clerk session is active, resolve userId+name, hydrate stores, and navigate
  const goAfterAuth = useCallback(
    async (rawEmail: string) => {
      try {
        const normEmail = rawEmail.trim().toLowerCase();
        console.log("[Login] goAfterAuth → begin", { normEmail });

        // 1) Lightweight lookup
        const found = await lookupUserByEmail(normEmail);
        console.log("[Login] lookupUserByEmail → result", {
          found: !!found,
          userId: found?.userId,
        });

        if (!found) {
          console.log(
            "[Login] lookupUserByEmail → not found, redirecting to /auth/register"
          );
          router.replace("/auth/register");
          return;
        }

        const { userId, name: nameFromLookup } = found;

        // 2) Kick off full profile fetch in parallel
        const profilePromise = getUserProfile(userId);

        // 3) Seed auth immediately so Header shows name right away
        const authApi = useAuthStore.getState() as any;
        if (typeof authApi.setAuth === "function") {
          authApi.setAuth({
            userId,
            email: normEmail,
            name: nameFromLookup ?? null,
          });
        } else if (typeof authApi.setUser === "function") {
          // older API compatibility
          authApi.setUser({
            UserId: userId,
            Email: normEmail,
            Name: nameFromLookup ?? null,
          });
        }

        // 4) Login-time share hydration (user_login_share_hydration)
        try {
          console.log("[Login] userLoginShareHydration → start", { userId });
          const payload = await fetchUserLoginShareHydration(userId);
          console.log("[Login] userLoginShareHydration → payload", {
            userId,
            sessionCount: payload.sessions.length,
          });

          const shareApi = useShareStore.getState() as any;
          if (typeof shareApi.hydrateFromServer === "function") {
            shareApi.hydrateFromServer(payload);
            console.log(
              "[Login] userLoginShareHydration → hydrateFromServer done",
              { userId }
            );
          } else {
            console.warn(
              "[Login] userLoginShareHydration → hydrateFromServer missing on share store"
            );
          }
        } catch (e: any) {
          console.warn(
            "[Login] userLoginShareHydration → failed",
            e?.message ?? e
          );
          // Do not block login on share hydration failure.
        }

        // 5) Clear stale profile, then hydrate with the fetched one
        useProfileStore.getState().setProfile(null);
        const user = await profilePromise;

        // If lookup didn't have a name, also backfill auth.name from profile.Name
        if (!nameFromLookup && typeof authApi.setAuth === "function") {
          authApi.setAuth({
            userId,
            email: normEmail,
            name: user?.Name ?? null,
          });
        }

        useProfileStore.getState().setProfile(user);

        console.log("[Login] goAfterAuth → navigate home", { userId });
        router.replace("/");
      } catch (err: any) {
        console.error("[Login] goAfterAuth → error", err);
        Alert.alert(
          "Login error",
          err?.message ?? "Something went wrong. Please try again."
        );
      }
    },
    [router]
  );

  const switchMode = useCallback(() => {
    if (submitting) return;
    setMode((m) => (m === "signIn" ? "signUp" : "signIn"));
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setPendingVerification(false);
    setCode("");
    setResetStep("none");
    setResetCode("");
    setNewPassword("");
    setShowNewPassword(false);

    // Clear second-factor state
    setSecondFactorStep("none");
    setSecondFactorCode("");
    setSecondFactorEmailAddressId(null);
  }, [submitting]);

  const beginEmailSecondFactor = useCallback(
    async (attempt: any) => {
      if (!signInLoaded || !signIn) return;

      // Pick the email_code factor (Client Trust usually provides this) :contentReference[oaicite:2]{index=2}
      const factors = attempt?.supportedSecondFactors;
      const emailFactor = Array.isArray(factors)
        ? factors.find((f: any) => f?.strategy === "email_code")
        : null;

      if (!emailFactor?.emailAddressId) {
        Alert.alert(
          "Verification required",
          "This sign-in requires a verification step, but no email second factor is available for this account."
        );
        return;
      }

      setSecondFactorEmailAddressId(emailFactor.emailAddressId);
      setSecondFactorCode("");
      setSecondFactorStep("verify");

      // Send the code (Client Trust flow) :contentReference[oaicite:3]{index=3}
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
    },
    [signIn, signInLoaded]
  );

  const verifyEmailSecondFactor = useCallback(async () => {
    if (!signInLoaded || !signIn || submitting) return;

    if (!secondFactorCode) {
      Alert.alert("Missing code", "Please enter the verification code.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: secondFactorCode,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActiveSignIn!({ session: result.createdSessionId });

        // Exit second-factor UI and continue normal login flow
        setSecondFactorStep("none");
        setSecondFactorCode("");
        setSecondFactorEmailAddressId(null);

        await goAfterAuth(email);
        return;
      }

      Alert.alert("Verification not complete", `Status: ${result.status}`);
    } catch (e: any) {
      Alert.alert(
        "Verification failed",
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Unknown error"
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    email,
    goAfterAuth,
    secondFactorCode,
    setActiveSignIn,
    signIn,
    signInLoaded,
    submitting,
  ]);

  const resendEmailSecondFactor = useCallback(async () => {
    if (!secondFactorEmailAddressId) return;
    if (!signInLoaded || !signIn || submitting) return;

    setSubmitting(true);
    try {
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: secondFactorEmailAddressId,
      });
      Alert.alert(
        "Code sent",
        "We sent a new verification code to your email."
      );
    } catch (e: any) {
      Alert.alert(
        "Could not resend",
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Unknown error"
      );
    } finally {
      setSubmitting(false);
    }
  }, [secondFactorEmailAddressId, signIn, signInLoaded, submitting]);

  const onSignIn = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting) return;
      if (!email || !password) {
        Alert.alert("Missing info", "Please enter email and password.");
        return;
      }
      setSubmitting(true);

      const attempt = await signIn.create({
        identifier: email.trim(),
        password,
      });

      console.log("[Clerk] signIn attempt status:", attempt.status);

      const factors = (attempt as any).supportedSecondFactors;
      console.log("[Clerk] supportedSecondFactors (raw):", factors);

      const strategies = Array.isArray(factors)
        ? factors.map((f: any) => f?.strategy).filter(Boolean)
        : [];
      console.log("[Clerk] supportedSecondFactors (strategies):", strategies);

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActiveSignIn!({ session: attempt.createdSessionId });
        await goAfterAuth(email);
        return;
      }

      if (attempt.status === "needs_second_factor") {
        await beginEmailSecondFactor(attempt);
        return;
      }

      Alert.alert("Sign in", `Status: ${attempt.status}`);
    } catch (e: any) {
      Alert.alert(
        "Sign in failed",
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Unknown error"
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    email,
    password,
    signInLoaded,
    signIn,
    setActiveSignIn,
    goAfterAuth,
    submitting,
  ]);

  const onSignUp = useCallback(async () => {
    try {
      if (!signUpLoaded || submitting) return;
      if (!email || !password) {
        Alert.alert("Missing info", "Please enter email and password.");
        return;
      }
      setSubmitting(true);

      // Step 1: create the sign-up in Clerk
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
      });

      // Case 1: sign-up completed immediately (e.g., email verification disabled in this instance)
      if (result.status === "complete" && result.createdSessionId) {
        await setActiveSignUp!({ session: result.createdSessionId });
        await goAfterAuth(email);
        return;
      }

      // Case 2: email verification required → send code and show verification UI
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      setCode("");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "Sign up failed. Please try again.";
      Alert.alert("Sign up failed", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    email,
    password,
    signUpLoaded,
    signUp,
    setActiveSignUp,
    goAfterAuth,
    submitting,
  ]);

  const onVerify = useCallback(async () => {
    try {
      if (!signUpLoaded || submitting) return;
      if (!code) {
        Alert.alert(
          "Missing code",
          "Please enter the verification code sent to your email."
        );
        return;
      }

      setSubmitting(true);

      // Step 2: attempt to verify the email code with Clerk
      const attempt = await signUp.attemptEmailAddressVerification({ code });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActiveSignUp!({ session: attempt.createdSessionId });
        await goAfterAuth(email);

        // Reset verification state for future sign-ups
        setPendingVerification(false);
        setCode("");
        return;
      }

      Alert.alert(
        "Verification not complete",
        `We could not complete verification. Status: ${attempt.status}. Please check the code and try again.`
      );
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "Verification failed. Please check the code and try again.";
      Alert.alert("Verification failed", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    signUpLoaded,
    signUp,
    setActiveSignUp,
    goAfterAuth,
    email,
    code,
    submitting,
  ]);

  const onStartPasswordReset = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting) return;
      if (!email) {
        Alert.alert(
          "Missing email",
          "Please enter your email to reset your password."
        );
        return;
      }

      setSubmitting(true);

      // Send the password reset code via email
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });

      setResetStep("verify");
      setResetCode("");
      setNewPassword("");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "If an account exists for this email, a reset code has been sent.";
      Alert.alert("Password reset", msg);
    } finally {
      setSubmitting(false);
    }
  }, [signInLoaded, signIn, email, submitting]);

  const onCompletePasswordReset = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting) return;

      if (!resetCode) {
        Alert.alert(
          "Missing code",
          "Please enter the reset code sent to your email."
        );
        return;
      }
      if (!newPassword) {
        Alert.alert("Missing password", "Please enter a new password.");
        return;
      }

      setSubmitting(true);

      // Attempt the reset using the code + new password
      const attempt = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode,
        password: newPassword,
      });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        // Clerk has accepted the reset; activate the new session
        await setActiveSignIn!({ session: attempt.createdSessionId });

        // Load backend user/profile and navigate home, same as normal sign-in
        Alert.alert(
          "Password reset successful",
          "You are now signed in with your new password."
        );
        await goAfterAuth(email);

        // Clear local reset state
        setResetStep("none");
        setResetCode("");
        setNewPassword("");
        setPassword("");

        return;
      }

      Alert.alert(
        "Reset not complete",
        `We could not complete the password reset. Status: ${attempt.status}. Please check the code and try again.`
      );
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "Password reset failed. Please check the code and try again.";
      Alert.alert("Password reset failed", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    signInLoaded,
    signIn,
    setActiveSignIn,
    goAfterAuth,
    email,
    resetCode,
    newPassword,
    submitting,
  ]);

  return (
    <>
      <SignedIn>
        <Redirect href="/" />
      </SignedIn>
      <SignedOut>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={16}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 20,
                paddingVertical: 24,
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
            >
              <View style={{ flex: 1, justifyContent: "space-between" }}>
                {/* Top content: logo, header, form */}
                <View style={{ gap: 14 }}>
                  {/* Logo / Hero */}
                  <View
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      width: "100%",
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        width: 120,
                        height: 120,
                        borderRadius: 60,
                        backgroundColor: c.surface,
                        borderColor: c.border,
                        borderWidth: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}
                    >
                      <Image
                        source={logoSource}
                        style={{
                          width: 96,
                          height: 96,
                          transform: [{ scale: 2 }],
                        }}
                        resizeMode="contain"
                      />
                    </View>

                    <Text
                      style={{
                        marginTop: 12,
                        color: c.text.primary,
                        fontSize: 20,
                        fontWeight: "700",
                        textAlign: "center",
                      }}
                    >
                      Web3Health
                    </Text>
                    <Text
                      style={{
                        marginTop: 4,
                        color: c.text.secondary,
                        fontSize: 14,
                        textAlign: "center",
                      }}
                    >
                      Share your health data securely.
                    </Text>
                  </View>

                  {/* Header */}
                  <View
                    style={{
                      marginBottom: 4,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: c.text.primary,
                        fontSize: 26,
                        fontWeight: "800",
                        textAlign: "center",
                      }}
                    >
                      {headerTitle}
                    </Text>
                    <Text
                      style={{
                        color: c.text.secondary,
                        marginTop: 6,
                        fontSize: 14,
                        textAlign: "center",
                      }}
                    >
                      {headerSubtitle}
                    </Text>
                  </View>

                  {/* Core form inputs */}
                  <View style={{ gap: 12 }}>
                    {/* Email row with icon */}
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
                        name="mail-outline"
                        size={20}
                        color={c.text.secondary}
                        style={{ marginRight: 8 }}
                        accessible={false}
                        importantForAccessibility="no"
                      />

                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Email"
                        placeholderTextColor={c.text.muted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        textContentType="emailAddress"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        editable={!submitting}
                        style={{
                          flex: 1,
                          color: c.text.primary,
                          fontSize: 16,
                        }}
                      />
                    </View>

                    {/* Password row (only when relevant) */}
                    {!(mode === "signIn" && resetStep !== "none") &&
                      !(mode === "signUp" && pendingVerification) &&
                      !(mode === "signIn" && secondFactorStep === "verify") && (
                        <View style={{ gap: 6 }}>
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
                              ref={passwordRef}
                              value={password}
                              onChangeText={setPassword}
                              placeholder="Password"
                              placeholderTextColor={c.text.muted}
                              secureTextEntry={!showPassword}
                              textContentType="password"
                              returnKeyType="done"
                              editable={!submitting}
                              style={{
                                flex: 1,
                                color: c.text.primary,
                                fontSize: 16,
                              }}
                            />

                            <Pressable
                              onPress={() => setShowPassword((prev) => !prev)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              disabled={submitting}
                              style={{ marginLeft: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={
                                showPassword ? "Hide password" : "Show password"
                              }
                              accessibilityHint="Toggles password visibility"
                            >
                              <Ionicons
                                name={showPassword ? "eye-off" : "eye"}
                                size={20}
                                color={c.text.secondary}
                                accessible={false}
                                importantForAccessibility="no"
                              />
                            </Pressable>
                          </View>

                          {/* Forgot password link (sign-in default only) */}
                          {mode === "signIn" && resetStep === "none" && (
                            <View
                              style={{
                                alignItems: "flex-end",
                              }}
                            >
                              <Pressable
                                onPress={() => {
                                  if (submitting) return;
                                  setResetStep("request");
                                  setResetCode("");
                                  setNewPassword("");
                                }}
                                hitSlop={{
                                  top: 8,
                                  bottom: 8,
                                  left: 8,
                                  right: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: c.text.secondary,
                                    fontSize: 13,
                                  }}
                                >
                                  Forgot password?
                                </Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      )}
                  </View>

                  {/* Flow-specific actions and extra fields */}
                  {mode === "signIn" ? (
                    secondFactorStep === "verify" ? (
                      // Second factor (Client Trust) verification
                      <View style={{ gap: 12, marginTop: 16 }}>
                        <Text
                          style={{
                            color: c.text.secondary,
                            fontSize: 14,
                          }}
                        >
                          Enter the verification code sent to {email.trim()}.
                        </Text>

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
                            name="keypad-outline"
                            size={20}
                            color={c.text.secondary}
                            style={{ marginRight: 8 }}
                            accessible={false}
                            importantForAccessibility="no"
                          />

                          <TextInput
                            value={secondFactorCode}
                            onChangeText={setSecondFactorCode}
                            placeholder="Verification code"
                            placeholderTextColor={c.text.muted}
                            keyboardType="number-pad"
                            autoCapitalize="none"
                            editable={!submitting}
                            style={{
                              flex: 1,
                              color: c.text.primary,
                              fontSize: 16,
                            }}
                          />
                        </View>

                        <Button
                          title={submitting ? "Verifying…" : "Verify"}
                          onPress={verifyEmailSecondFactor}
                          disabled={submitting}
                        />

                        <Pressable
                          onPress={resendEmailSecondFactor}
                          disabled={submitting}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ alignSelf: "flex-start" }}
                        >
                          <Text
                            style={{ color: c.text.secondary, fontSize: 14 }}
                          >
                            Resend code
                          </Text>
                        </Pressable>

                        <Pressable
                          onPress={() => {
                            if (submitting) return;
                            setSecondFactorStep("none");
                            setSecondFactorCode("");
                            setSecondFactorEmailAddressId(null);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ alignSelf: "flex-start" }}
                        >
                          <Text
                            style={{ color: c.text.secondary, fontSize: 14 }}
                          >
                            Back to sign in
                          </Text>
                        </Pressable>
                      </View>
                    ) : resetStep === "none" ? (
                      // Normal sign-in
                      <View style={{ gap: 12, marginTop: 16 }}>
                        <Button
                          title={submitting ? "Signing in…" : "Sign in"}
                          onPress={onSignIn}
                          disabled={submitting}
                        />
                      </View>
                    ) : resetStep === "request" ? (
                      // Step 1: ask for email to send reset code
                      <View style={{ gap: 12, marginTop: 16 }}>
                        <Text
                          style={{
                            color: c.text.secondary,
                            fontSize: 14,
                          }}
                        >
                          Enter your email and we&apos;ll send you a password
                          reset code.
                        </Text>
                        <Button
                          title={
                            submitting ? "Sending code…" : "Send reset code"
                          }
                          onPress={onStartPasswordReset}
                          disabled={submitting}
                        />
                        <Pressable
                          onPress={() => {
                            if (submitting) return;
                            setResetStep("none");
                            setResetCode("");
                            setNewPassword("");
                          }}
                          hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                          }}
                          style={{ alignSelf: "flex-start" }}
                        >
                          <Text
                            style={{
                              color: c.text.secondary,
                              fontSize: 14,
                            }}
                          >
                            Back to sign in
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      // resetStep === 'verify' → Step 2: enter code + new password
                      <View style={{ gap: 12, marginTop: 16 }}>
                        <Text
                          style={{
                            color: c.text.secondary,
                            fontSize: 14,
                          }}
                        >
                          We sent a reset code to {email.trim()}. Enter the code
                          and choose a new password.
                        </Text>

                        {/* Reset code row */}
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
                            name="keypad-outline"
                            size={20}
                            color={c.text.secondary}
                            style={{ marginRight: 8 }}
                            accessible={false}
                            importantForAccessibility="no"
                          />

                          <TextInput
                            value={resetCode}
                            onChangeText={setResetCode}
                            placeholder="Reset code"
                            placeholderTextColor={c.text.muted}
                            keyboardType="number-pad"
                            autoCapitalize="none"
                            editable={!submitting}
                            style={{
                              flex: 1,
                              color: c.text.primary,
                              fontSize: 16,
                            }}
                          />
                        </View>

                        {/* New password row */}
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
                            secureTextEntry={!showNewPassword}
                            editable={!submitting}
                            style={{
                              flex: 1,
                              color: c.text.primary,
                              fontSize: 16,
                            }}
                          />
                          <Pressable
                            onPress={() => setShowNewPassword((prev) => !prev)}
                            hitSlop={{
                              top: 8,
                              bottom: 8,
                              left: 8,
                              right: 8,
                            }}
                            disabled={submitting}
                            style={{ marginLeft: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              showNewPassword
                                ? "Hide new password"
                                : "Show new password"
                            }
                            accessibilityHint="Toggles password visibility"
                          >
                            <Ionicons
                              name={showNewPassword ? "eye-off" : "eye"}
                              size={20}
                              color={c.text.secondary}
                              accessible={false}
                              importantForAccessibility="no"
                            />
                          </Pressable>
                        </View>

                        <Button
                          title={submitting ? "Resetting…" : "Reset password"}
                          onPress={onCompletePasswordReset}
                          disabled={submitting}
                        />
                        <Pressable
                          onPress={() => {
                            if (submitting) return;
                            setResetStep("none");
                            setResetCode("");
                            setNewPassword("");
                          }}
                          hitSlop={{
                            top: 8,
                            bottom: 8,
                            left: 8,
                            right: 8,
                          }}
                          style={{ alignSelf: "flex-start" }}
                        >
                          <Text
                            style={{
                              color: c.text.secondary,
                              fontSize: 14,
                            }}
                          >
                            Back to sign in
                          </Text>
                        </Pressable>
                      </View>
                    )
                  ) : !pendingVerification ? (
                    // Sign-up: Step 1 (email + password)
                    <View style={{ gap: 12, marginTop: 16 }}>
                      <Button
                        title={submitting ? "Creating…" : "Create account"}
                        onPress={onSignUp}
                        disabled={submitting}
                      />
                    </View>
                  ) : (
                    // Sign-up: Step 2 (verify email code)
                    <View style={{ gap: 12, marginTop: 16 }}>
                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 14,
                        }}
                      >
                        We sent a verification code to {email.trim()}. Enter it
                        below to finish creating your account.
                      </Text>

                      {/* Verification code row */}
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
                          name="keypad-outline"
                          size={20}
                          color={c.text.secondary}
                          style={{ marginRight: 8 }}
                          accessible={false}
                          importantForAccessibility="no"
                        />

                        <TextInput
                          value={code}
                          onChangeText={setCode}
                          placeholder="Verification code"
                          placeholderTextColor={c.text.muted}
                          keyboardType="number-pad"
                          autoCapitalize="none"
                          editable={!submitting}
                          style={{
                            flex: 1,
                            color: c.text.primary,
                            fontSize: 16,
                          }}
                        />
                      </View>

                      <Button
                        title={submitting ? "Verifying…" : "Verify email"}
                        onPress={onVerify}
                        disabled={submitting}
                      />
                      <Pressable
                        onPress={() => {
                          if (submitting) return;
                          setPendingVerification(false);
                          setCode("");
                        }}
                        hitSlop={{
                          top: 8,
                          bottom: 8,
                          left: 8,
                          right: 8,
                        }}
                        style={{ alignSelf: "flex-start" }}
                      >
                        <Text
                          style={{
                            color: c.text.secondary,
                            fontSize: 14,
                          }}
                        >
                          Change email
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Bottom mode switch links */}
                <View style={{ alignItems: "center", marginTop: 24 }}>
                  {mode === "signIn" && resetStep === "none" && (
                    <Pressable
                      onPress={switchMode}
                      disabled={submitting}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 14,
                          textAlign: "center",
                        }}
                      >
                        {"Don't have an account? "}
                        <Text
                          style={{
                            color: c.primary,
                            fontWeight: "600",
                          }}
                        >
                          Create account
                        </Text>
                      </Text>
                    </Pressable>
                  )}

                  {mode === "signUp" && !pendingVerification && (
                    <Pressable
                      onPress={switchMode}
                      disabled={submitting}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginTop: 8 }}
                    >
                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 14,
                          textAlign: "center",
                        }}
                      >
                        Already have an account?{" "}
                        <Text
                          style={{
                            color: c.primary,
                            fontWeight: "600",
                          }}
                        >
                          Sign in
                        </Text>
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SignedOut>
    </>
  );
}
