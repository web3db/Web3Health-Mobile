// src/config/featureFlags.ts

// Small helper to parse boolean-ish env values
function parseBool(v: unknown): boolean | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return undefined;
}

/**
 * Test-mode flags:
 * - TEST_MODE: enables backdated-anchoring simulations (client-only QA)
 * - TEST_FORCE_DAY0: force-run Day-0 probe/send if any morning data exists
 * - TEST_FORCE_SKIP_DAY0: skip Day-0 even if data exists (full-day pipeline only)
 *
 * SAFETY: In non-dev builds, TEST_MODE is force-disabled.
 * You can toggle via Expo envs:
 *   EXPO_PUBLIC_SHARE_TEST_MODE=true
 *   EXPO_PUBLIC_SHARE_TEST_FORCE_DAY0=true
 *   EXPO_PUBLIC_SHARE_TEST_FORCE_SKIP_DAY0=true
 */
const envTestMode = parseBool(process.env.EXPO_PUBLIC_SHARE_TEST_MODE);
const envForceDay0 = parseBool(process.env.EXPO_PUBLIC_SHARE_TEST_FORCE_DAY0);
const envSkipDay0 = parseBool(process.env.EXPO_PUBLIC_SHARE_TEST_FORCE_SKIP_DAY0);

// Infer test mode automatically if a simulated day length is provided
const inferFromSim = !!process.env.EXPO_PUBLIC_SIM_DAY_MS;

// Base booleans (prefer env if provided; default to false)
let TEST_MODE =  (envTestMode ?? false) || (__DEV__ && inferFromSim);
let TEST_FORCE_DAY0 = envForceDay0 ?? false;
let TEST_FORCE_SKIP_DAY0 = envSkipDay0 ?? false;

// Hard safety: never allow TEST_MODE in production builds.
if (!__DEV__ && TEST_MODE) {
  // eslint-disable-next-line no-console
  console.warn('[SHARE][TestMode] Disabled in non-dev build.');
  TEST_MODE = false;
  TEST_FORCE_DAY0 = false;
  TEST_FORCE_SKIP_DAY0 = false;
}

// Optional sanity: if both force flags are set, prefer explicit skip off (cannot both be true)
if (TEST_FORCE_DAY0 && TEST_FORCE_SKIP_DAY0) {
  // eslint-disable-next-line no-console
  console.warn('[SHARE][TestMode] Both TEST_FORCE_DAY0 and TEST_FORCE_SKIP_DAY0 were true; disabling both.');
  TEST_FORCE_DAY0 = false;
  TEST_FORCE_SKIP_DAY0 = false;
}

export const testFlags = {
  TEST_MODE,
  TEST_FORCE_DAY0,
  TEST_FORCE_SKIP_DAY0,
} as const;

export const featureFlags = {
  home: {
    showTracker: true,
    showRecommendations: true,
    showSharing: true,
    showQuickActions: false,
    showStreak: false,
    showTip: false,
  },
} as const;
