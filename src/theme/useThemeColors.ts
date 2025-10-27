import { palette } from './colors';
import { useThemeController } from './ThemeController';

export function useThemeColors() {
  const { resolvedScheme } = useThemeController();
  return resolvedScheme === 'dark' ? palette.dark : palette.light;
}
