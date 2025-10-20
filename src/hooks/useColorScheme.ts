// src/hooks/useColorScheme.ts
import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';

export function useColorScheme(): 'light' | 'dark' {
  const initial: 'light' | 'dark' =
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

  const [scheme, setScheme] = useState<'light' | 'dark'>(initial);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      const next: 'light' | 'dark' = colorScheme === 'dark' ? 'dark' : 'light';
      setScheme((prev) => (prev === next ? prev : next));
    });
    return () => (sub as any)?.remove?.();
  }, []);

  return scheme;
}
