// app/auth/login.tsx
import Button from "@/src/components/ui/Button";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useSession, useSignIn, useSignUp } from "@clerk/clerk-expo";

import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Mode = "signIn" | "signUp";

export default function LoginScreen() {
  const c = useThemeColors();
  const router = useRouter();
  const passwordRef = useRef<TextInput | null>(null);
  const confirmPasswordRef = useRef<TextInput | null>(null);
  const logoSource =
    c.bg === "#0B0B0B"
      ? require("../../assets/images/Web3Health-dark.png")
      : require("../../assets/images/Web3Health-light.png");
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

  const { session, isLoaded: sessionLoaded } = useSession();

  const [postAuthPending, setPostAuthPending] = useState(false);

  const isResetPasswordTask = useCallback((s: any) => {
    // We can’t guarantee the exact shape across versions here.
    // Common: session.currentTask = { key: "reset-password" }
    // Fallback: session.currentTask = "reset-password"
    const task = s?.currentTask;
    const key = task?.key ?? task?.name ?? task;
    return key === "reset-password";
  }, []);

  const finishAuthGate = useCallback(
    async (createdSessionId: string, kind: "signIn" | "signUp") => {
      console.log("[Login] finishAuthGate start", { kind });
      setPostAuthPending(true);

      if (kind === "signIn") {
        await setActiveSignIn!({ session: createdSessionId });
      } else {
        await setActiveSignUp!({ session: createdSessionId });
      }

      console.log("[Login] finishAuthGate session_activated", { kind });
    },
    [setActiveSignIn, setActiveSignUp],
  );

  // Once Clerk session is active, decide whether to force reset-password or continue normal flow.
  React.useEffect(() => {
    if (!sessionLoaded) return;
    if (!postAuthPending) return;
    if (!session) return;

    const currentTask = (session as any)?.currentTask;
    console.log("[Login] postAuth session_ready", { currentTask });

    if (isResetPasswordTask(session)) {
      console.log("[Login] redirect_reset_required");
      setPostAuthPending(false);
      router.replace("/auth/reset-required");
      return;
    }

    console.log("[Login] redirect_root_for_gate");
    setPostAuthPending(false);
    router.replace("/");
  }, [sessionLoaded, session, postAuthPending, isResetPasswordTask, router]);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordChecks = React.useMemo(() => {
    const value = password ?? "";
    return {
      minLength: value.length >= 8,
      hasUpper: /[A-Z]/.test(value),
      hasLower: /[a-z]/.test(value),
      hasNumber: /\d/.test(value),
      hasSymbol: /[^A-Za-z0-9]/.test(value),
      matchesConfirm: !!confirmPassword && value === confirmPassword,
    };
  }, [password, confirmPassword]);

  const passwordStrengthLabel = React.useMemo(() => {
    const score = [
      passwordChecks.minLength,
      passwordChecks.hasUpper,
      passwordChecks.hasLower,
      passwordChecks.hasNumber,
      passwordChecks.hasSymbol,
    ].filter(Boolean).length;

    if (!password) return "";
    if (score <= 2) return "Weak";
    if (score <= 4) return "Good";
    return "Strong";
  }, [password, passwordChecks]);

  const passwordExamples = [
    "RiverStone!29",
    "HealthData#2026",
    "Mint-Cloud7-Map",
  ];

  const [submitting, setSubmitting] = useState(false);
  // Email verification (sign-up) state
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resetResendCountdown, setResetResendCountdown] = useState(0);
  // Password reset (sign-in) state
  const [resetStep, setResetStep] = useState<"none" | "request" | "verify">(
    "none",
  );
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const resetPasswordChecks = React.useMemo(() => {
    const value = newPassword ?? "";
    return {
      minLength: value.length >= 8,
      hasUpper: /[A-Z]/.test(value),
      hasLower: /[a-z]/.test(value),
      hasNumber: /\d/.test(value),
      hasSymbol: /[^A-Za-z0-9]/.test(value),
      matchesConfirm: !!confirmNewPassword && value === confirmNewPassword,
    };
  }, [newPassword, confirmNewPassword]);

  const resetPasswordStrengthLabel = React.useMemo(() => {
    const score = [
      resetPasswordChecks.minLength,
      resetPasswordChecks.hasUpper,
      resetPasswordChecks.hasLower,
      resetPasswordChecks.hasNumber,
      resetPasswordChecks.hasSymbol,
    ].filter(Boolean).length;

    if (!newPassword) return "";
    if (score <= 2) return "Weak";
    if (score <= 4) return "Good";
    return "Strong";
  }, [newPassword, resetPasswordChecks]);

  // Second factor (Client Trust) state for sign-in
  const [secondFactorStep, setSecondFactorStep] = useState<"none" | "verify">(
    "none",
  );
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorEmailAddressId, setSecondFactorEmailAddressId] = useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (resendCountdown <= 0) return;

    const timer = setTimeout(() => {
      setResendCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCountdown]);

  React.useEffect(() => {
    if (resetResendCountdown <= 0) return;

    const timer = setTimeout(() => {
      setResetResendCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resetResendCountdown]);

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

  const PasswordHintRow = ({ ok, text }: { ok: boolean; text: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Ionicons
        name={ok ? "checkmark-circle" : "ellipse-outline"}
        size={16}
        color={ok ? c.primary : c.text.muted}
        accessible={false}
        importantForAccessibility="no"
      />
      <Text
        style={{
          color: ok ? c.text.primary : c.text.secondary,
          fontSize: 13,
        }}
      >
        {text}
      </Text>
    </View>
  );

  const normalizedEmail = email.trim().toLowerCase();

  const isPrimaryPasswordVisible =
    !(mode === "signIn" && resetStep !== "none") &&
    !(mode === "signUp" && pendingVerification) &&
    !(mode === "signIn" && secondFactorStep === "verify");

  const isEmailLocked =
    postAuthPending ||
    secondFactorStep === "verify" ||
    pendingVerification ||
    resetStep === "verify";

  const clearPasswordResetState = useCallback(() => {
    setResetStep("none");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setResetResendCountdown(0);
  }, []);

  const clearSecondFactorState = useCallback(() => {
    setSecondFactorStep("none");
    setSecondFactorCode("");
    setSecondFactorEmailAddressId(null);
  }, []);

  const switchMode = useCallback(() => {
    if (submitting || postAuthPending) return;
    setMode((m) => (m === "signIn" ? "signUp" : "signIn"));
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setConfirmPassword("");
    setShowConfirmPassword(false);

    setPendingVerification(false);
    setCode("");
    setResendCountdown(0);
    clearPasswordResetState();
    clearSecondFactorState();
  }, [
    submitting,
    postAuthPending,
    clearPasswordResetState,
    clearSecondFactorState,
  ]);

  const beginEmailSecondFactor = useCallback(
    async (attempt: any) => {
      if (!signInLoaded || !signIn || postAuthPending) return;

      // Pick the email_code factor (Client Trust usually provides this)
      const factors = attempt?.supportedSecondFactors;
      const emailFactor = Array.isArray(factors)
        ? factors.find((f: any) => f?.strategy === "email_code")
        : null;

      if (!emailFactor?.emailAddressId) {
        Alert.alert(
          "Verification required",
          "This sign-in requires a verification step, but no email second factor is available for this account.",
        );
        return;
      }

      setSecondFactorEmailAddressId(emailFactor.emailAddressId);
      setSecondFactorCode("");
      setSecondFactorStep("verify");

      // Send the code (Client Trust flow)
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: emailFactor.emailAddressId,
      });
    },
    [signIn, signInLoaded, postAuthPending],
  );

  const verifyEmailSecondFactor = useCallback(async () => {
    if (!signInLoaded || !signIn || submitting || postAuthPending) return;

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
        clearSecondFactorState();
        await finishAuthGate(result.createdSessionId, "signIn");
        return;
      }

      Alert.alert("Verification not complete", `Status: ${result.status}`);
    } catch (e: any) {
      Alert.alert(
        "Verification failed",
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Unknown error",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    finishAuthGate,
    secondFactorCode,
    signIn,
    signInLoaded,
    submitting,
    clearSecondFactorState,
    postAuthPending,
  ]);

  const resendEmailSecondFactor = useCallback(async () => {
    if (!secondFactorEmailAddressId) return;
    if (!signInLoaded || !signIn || submitting || postAuthPending) return;

    setSubmitting(true);
    try {
      await signIn.prepareSecondFactor({
        strategy: "email_code",
        emailAddressId: secondFactorEmailAddressId,
      });
      Alert.alert(
        "Code sent",
        "We sent a new verification code to your email.",
      );
    } catch (e: any) {
      Alert.alert(
        "Could not resend",
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Unknown error",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    secondFactorEmailAddressId,
    signIn,
    signInLoaded,
    submitting,
    postAuthPending,
  ]);

  const onSignIn = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting) return;
      if (!normalizedEmail || !password) {
        Alert.alert("Missing info", "Please enter email and password.");
        return;
      }

      setSubmitting(true);

      const attempt = await signIn.create({
        identifier: normalizedEmail,
        password,
      });

      console.log("[Clerk] signIn attempt status:", attempt.status);

      const factors = (attempt as any)?.supportedSecondFactors;
      console.log("[Clerk] supportedSecondFactors (raw):", factors);

      const strategies = Array.isArray(factors)
        ? factors.map((f: any) => f?.strategy).filter(Boolean)
        : [];
      console.log("[Clerk] supportedSecondFactors (strategies):", strategies);

      const hasEmailSecondFactor = strategies.includes("email_code");

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await finishAuthGate(attempt.createdSessionId, "signIn");
        return;
      }

      if (attempt.status === "needs_second_factor" || hasEmailSecondFactor) {
        await beginEmailSecondFactor(attempt);
        return;
      }

      Alert.alert("Sign in", `Status: ${attempt.status ?? "unknown"}`);
    } catch (e: any) {
      Alert.alert(
        "Sign in failed",
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Unknown error",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    normalizedEmail,
    password,
    signInLoaded,
    signIn,
    submitting,
    finishAuthGate,
    beginEmailSecondFactor,
  ]);

  const onSignUp = useCallback(async () => {
    try {
      if (!signUpLoaded || submitting) return;
      if (!normalizedEmail || !password) {
        Alert.alert("Missing info", "Please enter email and password.");
        return;
      }
      if (!confirmPassword) {
        Alert.alert("Missing info", "Please confirm your password.");
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert(
          "Passwords do not match",
          "Please make sure both passwords match.",
        );
        return;
      }

      setSubmitting(true);

      const result = await signUp.create({
        emailAddress: normalizedEmail,
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await finishAuthGate(result.createdSessionId, "signUp");
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
      setCode("");
      setResendCountdown(30);
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
    normalizedEmail,
    password,
    confirmPassword,
    signUpLoaded,
    signUp,
    submitting,
    finishAuthGate,
  ]);

  const onVerify = useCallback(async () => {
    try {
      if (!signUpLoaded || submitting) return;
      if (!code) {
        Alert.alert(
          "Missing code",
          "Please enter the verification code sent to your email.",
        );
        return;
      }

      setSubmitting(true);

      // Step 2: attempt to verify the email code with Clerk
      const attempt = await signUp.attemptEmailAddressVerification({ code });

      if (attempt.status === "complete" && attempt.createdSessionId) {
        await finishAuthGate(attempt.createdSessionId, "signUp");
        setPendingVerification(false);
        setCode("");
        setResendCountdown(0);
        return;
      }

      Alert.alert(
        "Verification not complete",
        `We could not complete verification. Status: ${attempt.status}. Please check the code and try again.`,
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
  }, [signUpLoaded, signUp, submitting, code, normalizedEmail, finishAuthGate]);

  const onResendVerificationCode = useCallback(async () => {
    try {
      if (!signUpLoaded || !signUp || submitting || postAuthPending) return;
      if (!pendingVerification) return;
      if (resendCountdown > 0) return;

      setSubmitting(true);

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResendCountdown(30);

      Alert.alert(
        "Code sent",
        "We sent a new verification code to your email.",
      );
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "Could not resend the verification code. Please try again.";
      Alert.alert("Could not resend code", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    signUpLoaded,
    signUp,
    submitting,
    postAuthPending,
    pendingVerification,
    resendCountdown,
  ]);

  const onStartPasswordReset = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting) return;
      if (!normalizedEmail) {
        Alert.alert(
          "Missing email",
          "Please enter your email to reset your password.",
        );
        return;
      }

      setSubmitting(true);

      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: normalizedEmail,
      });
      clearPasswordResetState();
      setResetStep("verify");
      setResetResendCountdown(30);
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "If an account exists for this email, a reset code has been sent.";
      Alert.alert("Password reset", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    signInLoaded,
    signIn,
    normalizedEmail,
    submitting,
    clearPasswordResetState,
  ]);

  const onResendPasswordResetCode = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting || postAuthPending) return;
      if (resetStep !== "verify") return;
      if (!normalizedEmail) return;
      if (resetResendCountdown > 0) return;

      setSubmitting(true);

      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: normalizedEmail,
      });

      setResetCode("");
      setResetResendCountdown(30);

      Alert.alert("Code sent", "We sent a new reset code to your email.");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.message ??
        "Could not resend the reset code. Please try again.";
      Alert.alert("Could not resend code", msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    signInLoaded,
    signIn,
    submitting,
    postAuthPending,
    resetStep,
    normalizedEmail,
    resetResendCountdown,
  ]);

  const onCompletePasswordReset = useCallback(async () => {
    try {
      if (!signInLoaded || !signIn || submitting) return;

      if (!resetCode) {
        Alert.alert(
          "Missing code",
          "Please enter the reset code sent to your email.",
        );
        return;
      }
      if (!newPassword) {
        Alert.alert("Missing password", "Please enter a new password.");
        return;
      }
      if (!confirmNewPassword) {
        Alert.alert("Missing password", "Please confirm your new password.");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        Alert.alert(
          "Passwords do not match",
          "Please make sure both passwords match.",
        );
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
        await finishAuthGate(attempt.createdSessionId, "signIn");

        Alert.alert(
          "Password reset successful",
          "You are now signed in with your new password.",
        );

        clearPasswordResetState();
        setPassword("");
        return;
      }

      Alert.alert(
        "Reset not complete",
        `We could not complete the password reset. Status: ${attempt.status}. Please check the code and try again.`,
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
    submitting,
    resetCode,
    newPassword,
    confirmNewPassword,
    normalizedEmail,
    finishAuthGate,
    clearPasswordResetState,
  ]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingVertical: 24,
            paddingBottom: 180,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
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
                    backgroundColor: isEmailLocked ? c.surface : c.elevated,
                    borderColor: isEmailLocked ? c.border : c.muted,
                    borderWidth: 1.5,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 56,
                    opacity: isEmailLocked ? 0.75 : 1,
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
                    onSubmitEditing={() => {
                      if (!isEmailLocked && isPrimaryPasswordVisible) {
                        passwordRef.current?.focus();
                      }
                    }}
                    editable={!(submitting || isEmailLocked)}
                    style={{
                      flex: 1,
                      color: isEmailLocked ? c.text.secondary : c.text.primary,
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
                          returnKeyType={
                            mode === "signUp" && !pendingVerification
                              ? "next"
                              : "done"
                          }
                          onSubmitEditing={() => {
                            if (mode === "signUp" && !pendingVerification) {
                              confirmPasswordRef.current?.focus();
                            }
                          }}
                          editable={!(submitting || postAuthPending)}
                          style={{
                            flex: 1,
                            color: c.text.primary,
                            fontSize: 16,
                          }}
                        />

                        <Pressable
                          onPress={() => setShowPassword((prev) => !prev)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          disabled={submitting || postAuthPending}
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

                      {mode === "signUp" && !pendingVerification && (
                        <>
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
                              marginTop: 12,
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
                              ref={confirmPasswordRef}
                              value={confirmPassword}
                              onChangeText={setConfirmPassword}
                              placeholder="Confirm password"
                              placeholderTextColor={c.text.muted}
                              secureTextEntry={!showConfirmPassword}
                              textContentType="password"
                              returnKeyType="done"
                              editable={!(submitting || postAuthPending)}
                              style={{
                                flex: 1,
                                color: c.text.primary,
                                fontSize: 16,
                              }}
                            />

                            <Pressable
                              onPress={() =>
                                setShowConfirmPassword((prev) => !prev)
                              }
                              hitSlop={{
                                top: 8,
                                bottom: 8,
                                left: 8,
                                right: 8,
                              }}
                              disabled={submitting || postAuthPending}
                              style={{ marginLeft: 8 }}
                              accessibilityRole="button"
                              accessibilityLabel={
                                showConfirmPassword
                                  ? "Hide confirm password"
                                  : "Show confirm password"
                              }
                              accessibilityHint="Toggles confirm password visibility"
                            >
                              <Ionicons
                                name={showConfirmPassword ? "eye-off" : "eye"}
                                size={20}
                                color={c.text.secondary}
                                accessible={false}
                                importantForAccessibility="no"
                              />
                            </Pressable>
                          </View>

                          <View
                            style={{
                              marginTop: 10,
                              padding: 12,
                              borderRadius: 12,
                              backgroundColor: c.surface,
                              borderWidth: 1,
                              borderColor: c.border,
                              gap: 8,
                            }}
                          >
                            <Text
                              style={{
                                color: c.text.primary,
                                fontSize: 14,
                                fontWeight: "700",
                              }}
                            >
                              Password guidance
                            </Text>

                            <Text
                              style={{
                                color: c.text.secondary,
                                fontSize: 13,
                                lineHeight: 18,
                              }}
                            >
                              Use at least 8 characters. Longer passwords or
                              passphrases are usually stronger.
                            </Text>

                            {!!passwordStrengthLabel && (
                              <Text
                                style={{
                                  color: c.text.secondary,
                                  fontSize: 13,
                                }}
                              >
                                Strength: {passwordStrengthLabel}
                              </Text>
                            )}

                            <PasswordHintRow
                              ok={passwordChecks.minLength}
                              text="At least 8 characters"
                            />
                            <PasswordHintRow
                              ok={passwordChecks.hasUpper}
                              text="Add an uppercase letter"
                            />
                            <PasswordHintRow
                              ok={passwordChecks.hasLower}
                              text="Add a lowercase letter"
                            />
                            <PasswordHintRow
                              ok={passwordChecks.hasNumber}
                              text="Add a number"
                            />
                            <PasswordHintRow
                              ok={passwordChecks.hasSymbol}
                              text="Add a symbol"
                            />

                            {!!confirmPassword && (
                              <PasswordHintRow
                                ok={passwordChecks.matchesConfirm}
                                text="Passwords match"
                              />
                            )}

                            <Text
                              style={{
                                color: c.text.secondary,
                                fontSize: 12,
                                marginTop: 4,
                                lineHeight: 18,
                              }}
                            >
                              Examples: {passwordExamples.join("   •   ")}
                            </Text>
                          </View>
                        </>
                      )}

                      {/* Forgot password link (sign-in default only) */}
                      {mode === "signIn" && resetStep === "none" && (
                        <View
                          style={{
                            alignItems: "flex-end",
                          }}
                        >
                          <Pressable
                            onPress={() => {
                              if (submitting || postAuthPending) return;
                              clearPasswordResetState();
                              setResetStep("request");
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
                      Enter the verification code sent to {normalizedEmail}.
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
                        editable={!(submitting || postAuthPending)}
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
                      disabled={submitting || postAuthPending}
                    />

                    <Pressable
                      onPress={resendEmailSecondFactor}
                      disabled={submitting || postAuthPending}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        alignSelf: "stretch",
                        minHeight: 48,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: c.surface,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 16,
                        opacity: submitting || postAuthPending ? 0.6 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: c.text.primary,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        Resend code
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (submitting || postAuthPending) return;
                        clearSecondFactorState();
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{
                        alignSelf: "stretch",
                        minHeight: 48,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: c.bg,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 16,
                        opacity: submitting || postAuthPending ? 0.6 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
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
                      disabled={submitting || postAuthPending}
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
                      Enter your email and we&apos;ll send you a password reset
                      code.
                    </Text>
                    <Button
                      title={submitting ? "Sending code…" : "Send reset code"}
                      onPress={onStartPasswordReset}
                      disabled={submitting || postAuthPending}
                    />
                    <Pressable
                      onPress={() => {
                        if (submitting || postAuthPending) return;
                        clearPasswordResetState();
                      }}
                      hitSlop={{
                        top: 8,
                        bottom: 8,
                        left: 8,
                        right: 8,
                      }}
                      style={{
                        alignSelf: "stretch",
                        minHeight: 48,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: c.bg,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 16,
                        opacity: submitting || postAuthPending ? 0.6 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 14,
                          fontWeight: "600",
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
                      We sent a reset code to {normalizedEmail}. Enter the code
                      and choose a new password.
                    </Text>

                    <Text
                      style={{
                        color: c.text.muted,
                        fontSize: 12,
                        marginTop: 4,
                        lineHeight: 16,
                      }}
                    >
                      If you do not see the email within a minute, please check
                      your spam or junk folder.
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
                        editable={!(submitting || postAuthPending)}
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
                        editable={!(submitting || postAuthPending)}
                        style={{
                          flex: 1,
                          color: c.text.primary,
                          fontSize: 16,
                        }}
                      />

                      <Pressable
                        onPress={() => setShowNewPassword((prev) => !prev)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        disabled={submitting || postAuthPending}
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

                    {/* Confirm new password row */}
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
                        secureTextEntry={!showConfirmNewPassword}
                        editable={!(submitting || postAuthPending)}
                        style={{
                          flex: 1,
                          color: c.text.primary,
                          fontSize: 16,
                        }}
                      />

                      <Pressable
                        onPress={() =>
                          setShowConfirmNewPassword((prev) => !prev)
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        disabled={submitting || postAuthPending}
                        style={{ marginLeft: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showConfirmNewPassword
                            ? "Hide confirm new password"
                            : "Show confirm new password"
                        }
                        accessibilityHint="Toggles confirm password visibility"
                      >
                        <Ionicons
                          name={showConfirmNewPassword ? "eye-off" : "eye"}
                          size={20}
                          color={c.text.secondary}
                          accessible={false}
                          importantForAccessibility="no"
                        />
                      </Pressable>
                    </View>

                    <View
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 12,
                        backgroundColor: c.surface,
                        borderWidth: 1,
                        borderColor: c.border,
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: c.text.primary,
                          fontSize: 14,
                          fontWeight: "700",
                        }}
                      >
                        Password guidance
                      </Text>

                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 13,
                          lineHeight: 18,
                        }}
                      >
                        Use at least 8 characters. Longer passwords or
                        passphrases are usually stronger.
                      </Text>

                      {!!resetPasswordStrengthLabel && (
                        <Text
                          style={{
                            color: c.text.secondary,
                            fontSize: 13,
                          }}
                        >
                          Strength: {resetPasswordStrengthLabel}
                        </Text>
                      )}

                      <PasswordHintRow
                        ok={resetPasswordChecks.minLength}
                        text="At least 8 characters"
                      />
                      <PasswordHintRow
                        ok={resetPasswordChecks.hasUpper}
                        text="Add an uppercase letter"
                      />
                      <PasswordHintRow
                        ok={resetPasswordChecks.hasLower}
                        text="Add a lowercase letter"
                      />
                      <PasswordHintRow
                        ok={resetPasswordChecks.hasNumber}
                        text="Add a number"
                      />
                      <PasswordHintRow
                        ok={resetPasswordChecks.hasSymbol}
                        text="Add a symbol"
                      />

                      {!!confirmNewPassword && (
                        <PasswordHintRow
                          ok={resetPasswordChecks.matchesConfirm}
                          text="Passwords match"
                        />
                      )}

                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 12,
                          marginTop: 4,
                          lineHeight: 18,
                        }}
                      >
                        Examples: {passwordExamples.join("   •   ")}
                      </Text>
                    </View>

                    <Button
                      title={submitting ? "Resetting…" : "Reset password"}
                      onPress={onCompletePasswordReset}
                      disabled={submitting || postAuthPending}
                    />

                    <Pressable
                      onPress={onResendPasswordResetCode}
                      disabled={
                        submitting ||
                        postAuthPending ||
                        resetResendCountdown > 0
                      }
                      hitSlop={{
                        top: 8,
                        bottom: 8,
                        left: 8,
                        right: 8,
                      }}
                      style={{
                        alignSelf: "stretch",
                        minHeight: 48,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: c.surface,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 16,
                        opacity:
                          submitting ||
                          postAuthPending ||
                          resetResendCountdown > 0
                            ? 0.6
                            : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: c.text.primary,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {resetResendCountdown > 0
                          ? `Resend code in ${resetResendCountdown}s`
                          : "Resend code"}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        if (submitting || postAuthPending) return;
                        clearPasswordResetState();
                      }}
                      hitSlop={{
                        top: 8,
                        bottom: 8,
                        left: 8,
                        right: 8,
                      }}
                      style={{
                        alignSelf: "stretch",
                        minHeight: 48,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: c.border,
                        backgroundColor: c.bg,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 16,
                        opacity: submitting || postAuthPending ? 0.6 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: c.text.secondary,
                          fontSize: 14,
                          fontWeight: "600",
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
                    disabled={submitting || postAuthPending}
                  />
                  <Text
                    style={{
                      color: c.text.secondary,
                      fontSize: 12,
                      textAlign: "center",
                      lineHeight: 18,
                    }}
                  >
                    Choose a password that is hard to guess and not reused from
                    another site.
                  </Text>
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
                    We sent a verification code to {normalizedEmail}. Enter it
                    below to finish creating your account.
                  </Text>

                  <Text
                    style={{
                      color: c.text.muted,
                      fontSize: 12,
                      marginTop: 4,
                      lineHeight: 16,
                    }}
                  >
                    If you do not see the email within a minute, please check
                    your spam or junk folder.
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
                      editable={!(submitting || postAuthPending)}
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
                    disabled={submitting || postAuthPending}
                  />

                  <Pressable
                    onPress={onResendVerificationCode}
                    disabled={
                      submitting || postAuthPending || resendCountdown > 0
                    }
                    hitSlop={{
                      top: 8,
                      bottom: 8,
                      left: 8,
                      right: 8,
                    }}
                    style={{
                      alignSelf: "stretch",
                      minHeight: 48,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.surface,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 16,
                      opacity:
                        submitting || postAuthPending || resendCountdown > 0
                          ? 0.6
                          : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: c.text.primary,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {resendCountdown > 0
                        ? `Resend code in ${resendCountdown}s`
                        : "Resend code"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (submitting || postAuthPending) return;
                      setPendingVerification(false);
                      setCode("");
                      setResendCountdown(0);
                    }}
                    hitSlop={{
                      top: 8,
                      bottom: 8,
                      left: 8,
                      right: 8,
                    }}
                    style={{
                      alignSelf: "stretch",
                      minHeight: 48,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: c.border,
                      backgroundColor: c.bg,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 16,
                      opacity: submitting || postAuthPending ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: c.text.secondary,
                        fontSize: 14,
                        fontWeight: "600",
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
                  disabled={submitting || postAuthPending}
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
                  disabled={submitting || postAuthPending}
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
  );
}
