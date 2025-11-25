// [LINKING-0] Single place for navigation-related deep links (public-safe only).
// We intentionally avoid private iOS URL schemes (e.g., App-Prefs, x-apple-health)
// and use only React Native's public Linking APIs.

import { Linking, Platform } from "react-native";

const TAG = "[Linking]";
// Minimal logger to keep consistency with your style; swap with your app logger if needed.
const log = (...a: any[]) => console.log(TAG, ...a);

/**
 * [LINKING-1] Open this app's Settings page.
 * - Public, supported on both iOS and Android.
 * - Returns true if the intent was fired (not a guarantee the user changed anything).
 */
export async function openAppSettings(): Promise<boolean> {
  try {
    console.log(TAG, "openAppSettings() → start; platform=", Platform.OS);
    await Linking.openSettings();
    log("openAppSettings → invoked");
    return true;
  } catch (e) {
    log("openAppSettings → failed", (e as any)?.message ?? e);
    return false;
  }
}

/**
 * [LINKING-2] Safe generic opener for http(s)/mailto/tel when needed by UI.
 * - Returns true if the link was opened.
 * - We keep it here to centralize Linking error handling.
 */
export async function openURLSafe(url: string): Promise<boolean> {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      log("openURLSafe → cannot open", url);
      return false;
    }
    await Linking.openURL(url);
    log("openURLSafe → opened", url);
    return true;
  } catch (e) {
    log("openURLSafe → failed", url, (e as any)?.message ?? e);
    return false;
  }
}

/**
 * [LINKING-3] Platform hint (optional helper for UI decisions).
 * - Useful if you want to conditionally render copy/icons per platform.
 */
export function isIOS(): boolean {
  return Platform.OS === "ios";
}
