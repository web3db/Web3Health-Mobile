// app/auth/login.tsx
import Button from '@/src/components/ui/Button';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { SignedIn, SignedOut, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { lookupUserIdByEmail } from '@/src/services/auth/api';
import { getUserProfile } from '@/src/services/profile/api';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useProfileStore } from '@/src/store/useProfileStore';
import { Redirect } from 'expo-router';
type Mode = 'signIn' | 'signUp';

export default function LoginScreen() {
  const c = useThemeColors();
  const router = useRouter();

  // Clerk hooks
  const { signIn, isLoaded: signInLoaded, setActive: setActiveSignIn } = useSignIn();
  const { signUp, isLoaded: signUpLoaded, setActive: setActiveSignUp } = useSignUp();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  

  const goAfterAuth = useCallback(
    async (rawEmail: string) => {
      try {
        const normEmail = rawEmail.trim().toLowerCase();
        const userId = await lookupUserIdByEmail(normEmail);

        if (userId == null) {
          // first-time: allow /auth/register even while SignedIn
          // (layout only blocks /auth/login for signed-in users)
          router.replace('/auth/register');
          return;
        }

        const user = await getUserProfile(userId);
        useAuthStore.getState().setAuth({ userId, email: normEmail });
        useProfileStore.getState().setProfile(user);
        router.replace('/');
      } catch (err: any) {
        Alert.alert('Login error', err?.message ?? 'Something went wrong. Please try again.');
      }
    },
    [router]
  );


  const switchMode = useCallback(() => {
    if (submitting) return;
    setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
    setEmail('');
    setPassword('');
  }, [submitting]);

  const onSignIn = useCallback(async () => {
    try {
      if (!signInLoaded || submitting) return;
      if (!email || !password) {
        Alert.alert('Missing info', 'Please enter email and password.');
        return;
      }
      setSubmitting(true);

      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActiveSignIn!({ session: attempt.createdSessionId });
        await goAfterAuth(email);
        return;
      }
      Alert.alert('Sign in', `Status: ${attempt.status}`);
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.errors?.[0]?.longMessage ?? e?.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }, [email, password, signInLoaded, signIn, setActiveSignIn, goAfterAuth, submitting]);

  const onSignUp = useCallback(async () => {
    try {
      if (!signUpLoaded || submitting) return;
      if (!email || !password) {
        Alert.alert('Missing info', 'Please enter email and password.');
        return;
      }
      setSubmitting(true);

      const attempt = await signUp.create({ emailAddress: email.trim(), password });
      if (attempt.status === 'complete' && attempt.createdSessionId) {
        await setActiveSignUp!({ session: attempt.createdSessionId });
        await goAfterAuth(email);
        return;
      }
      Alert.alert(
        'Sign up requires verification',
        'Email verification appears to be enabled in Clerk. Disable it for dev to use simple email+password without codes.'
      );
    } catch (e: any) {
      Alert.alert('Sign up failed', e?.errors?.[0]?.longMessage ?? e?.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }, [email, password, signUpLoaded, signUp, setActiveSignUp, goAfterAuth, submitting]);

  return (
    <>
      {/* If somehow we’re on /auth/login while already authenticated, bounce to home */}
      <SignedIn>
        <Redirect href="/" />
      </SignedIn>
      <SignedOut>
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 16 }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: c.text.primary, fontSize: 26, fontWeight: '800' }}>
                {mode === 'signIn' ? 'Sign in' : 'Create account'}
              </Text>
              <Text style={{ color: c.text.secondary, marginTop: 6 }}>
                {mode === 'signIn'
                  ? 'Use your email and password to sign in.'
                  : 'Enter an email and password to create your account.'}
              </Text>
            </View>

            <View style={{ gap: 10 }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={c.text.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!submitting}
                style={{
                  color: c.text.primary,
                  backgroundColor: c.surface,
                  borderColor: c.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={c.text.muted}
                secureTextEntry
                editable={!submitting}
                style={{
                  color: c.text.primary,
                  backgroundColor: c.surface,
                  borderColor: c.border,
                  borderWidth: 1,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              />
            </View>

            {mode === 'signIn' ? (
              <View style={{ gap: 12, marginTop: 12 }}>
                <Button title={submitting ? 'Signing in…' : 'Sign in'} onPress={onSignIn} disabled={submitting} />
                <Button title="Create an account" onPress={switchMode} disabled={submitting} />
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 12 }}>
                <Button title={submitting ? 'Creating…' : 'Create account'} onPress={onSignUp} disabled={submitting} />
                <Button title="I already have an account" onPress={switchMode} disabled={submitting} />
              </View>
            )}
          </View>
        </SafeAreaView>
      </SignedOut>
    </>
  );
}
