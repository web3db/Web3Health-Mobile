import { selectHydrated, selectUserId, useAuthStore } from '@/src/store/useAuthStore';
import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';

export default function Gate() {
  const { isLoaded, isSignedIn } = useAuth();
  const userId = useAuthStore(selectUserId);
  const hydrated = useAuthStore(selectHydrated);

  if (!isLoaded || !hydrated) return null; // wait for Clerk + store

  if (!isSignedIn) return <Redirect href="/auth/login" />;
  if (userId == null) return <Redirect href="/auth/register" />;
  console.log('Gate', { isLoaded, isSignedIn, hydrated, userId });

  return <Redirect href="/(app)/(tabs)" />;
}
