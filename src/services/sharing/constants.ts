// src/services/sharing/constants.ts
// ─────────────────────────────────────────────────────────────────────────────
// Share engine runtime constants (day length, grace, retries) with Test Mode.
// In Test Mode you can shorten "a day" and timing to speed up QA.
// In Production, we always fall back to real 24h days and safe timings.
// ─────────────────────────────────────────────────────────────────────────────

import { testFlags } from '@/src/config/featureFlags';

// Real 24h day for production
const REAL_DAY_MS = 24 * 60 * 60 * 1000;

// ENV knobs (kept exactly as you use them; populate via .env/.app config)
const retryMsFromEnv  = Number(process.env.EXPO_PUBLIC_RETRY_INTERVAL_MS ?? '');
const graceMsFromEnv  = Number(process.env.EXPO_PUBLIC_GRACE_WAIT_MS ?? '');
const simDayFromEnv   = Number(process.env.EXPO_PUBLIC_SIM_DAY_MS ?? '');
// ─────────────────────────────────────────────────────────────────────────────
// Test Mode timing (QA-friendly defaults; still overridable via env)
// Production timing (safer defaults)
// ─────────────────────────────────────────────────────────────────────────────
const { TEST_MODE } = testFlags;

const RAW_DAY_LENGTH_MS = REAL_DAY_MS;

// Retry interval:
// - Test Mode: env override or 20s default
// - Prod:      1h (tweak to 10–15m if you prefer)
const RAW_RETRY_INTERVAL_MS =
  TEST_MODE
    ? (Number.isFinite(retryMsFromEnv) && retryMsFromEnv > 0 ? retryMsFromEnv : 20_000)
    : 60 * 60 * 1000;// 1h

// One-time grace at the start of a new due day:
// - Test Mode: env override or 12s default
// - Prod:      10s default (safer than 0)
const RAW_GRACE_WAIT_MS =
  TEST_MODE
    ? (Number.isFinite(graceMsFromEnv) && graceMsFromEnv >= 0 ? graceMsFromEnv : 12_000)
    : 10_000;

// Max NO_DATA retries before cancel (policy shared across modes)
export const MAX_RETRIES = 3 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Production safeguard: never ship short "days" outside Test Mode.
// If RAW_DAY_LENGTH_MS < 6h and NOT Test Mode, force 24h.
// ─────────────────────────────────────────────────────────────────────────────
let SAFE_DAY_LENGTH_MS = RAW_DAY_LENGTH_MS;
if (!TEST_MODE && SAFE_DAY_LENGTH_MS < 6 * 60 * 60 * 1000) {
  // eslint-disable-next-line no-console
  console.error(
    `[SHARE][Config] DAY_LENGTH_MS (${SAFE_DAY_LENGTH_MS}) too short outside Test Mode — falling back to 24h.`,
  );
  SAFE_DAY_LENGTH_MS = REAL_DAY_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Exports consumed by planner/producer/store
// ─────────────────────────────────────────────────────────────────────────────
export const DAY_LENGTH_MS   = SAFE_DAY_LENGTH_MS;
export const RETRY_INTERVAL_MS = RAW_RETRY_INTERVAL_MS;
export const GRACE_WAIT_MS     = RAW_GRACE_WAIT_MS;

// One-line config for first-run banner
export function getShareRuntimeConfig() {
  return {
    __DEV__,
    TEST_MODE,
    DAY_LENGTH_MS,
    RETRY_INTERVAL_MS,
    MAX_RETRIES,
    GRACE_WAIT_MS,
    DAY_LENGTH_SOURCE: 'fixed_24h',
    EXPO_PUBLIC_SIM_DAY_MS: process.env.EXPO_PUBLIC_SIM_DAY_MS || undefined,
    EXPO_PUBLIC_RETRY_INTERVAL_MS: process.env.EXPO_PUBLIC_RETRY_INTERVAL_MS || undefined,
    EXPO_PUBLIC_GRACE_WAIT_MS: process.env.EXPO_PUBLIC_GRACE_WAIT_MS || undefined,
  };
}

