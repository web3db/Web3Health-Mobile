import RegisterForm from '@/src/components/auth/RegisterForm';
import Button from '@/src/components/ui/Button';
import { useThemeColors } from '@/src/theme/useThemeColors';
import { SignedIn, SignedOut } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RegisterScreen() {
  const c = useThemeColors();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <SignedOut>
        <View style={{ flex: 1, padding: 16, gap: 12, justifyContent: 'center' }}>
          <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '700' }}>
            You need to sign in first
          </Text>
          <Button title="Go to login" onPress={() => router.replace('/auth/login')} />
        </View>
      </SignedOut>

      <SignedIn>
        <RegisterForm />
      </SignedIn>
    </SafeAreaView>
  );
}
