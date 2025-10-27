import Constants from "expo-constants";

const urlFromEnv = process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined;
const urlFromExtra = (
  (Constants as any)?.expoConfig?.extra?.["EXPO_PUBLIC_SUPABASE_URL"] ??
  (Constants as any)?.manifest2?.extra?.["EXPO_PUBLIC_SUPABASE_URL"]
) as string | undefined;

const fnPathFromEnv = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_PATH as string | undefined;
const fnPathFromExtra = (
  (Constants as any)?.expoConfig?.extra?.["EXPO_PUBLIC_SUPABASE_FUNCTIONS_PATH"] ??
  (Constants as any)?.manifest2?.extra?.["EXPO_PUBLIC_SUPABASE_FUNCTIONS_PATH"]
) as string | undefined;

export const SUPABASE_URL = (urlFromEnv || urlFromExtra || "").replace(/\/$/, "");
export const SUPABASE_FUNCTIONS_PATH = ((fnPathFromEnv || fnPathFromExtra || "/functions/v1").startsWith("/")
  ? (fnPathFromEnv || fnPathFromExtra || "/functions/v1")
  : `/${fnPathFromEnv || fnPathFromExtra || "functions/v1"}`);

let runtimeUrlOverride: string | null = null;
export const setSupabaseUrlOverride = (url: string | null) => {
  runtimeUrlOverride = url ? url.replace(/\/$/, "") : null;
};

export const getSupabaseBaseUrl = () => runtimeUrlOverride || SUPABASE_URL;

export const getFunctionsBase = () => {
  const base = getSupabaseBaseUrl();
  if (!base) {
    const msg =
      "Supabase base URL is missing. Set EXPO_PUBLIC_SUPABASE_URL in .env or extra.EXPO_PUBLIC_SUPABASE_URL in app.json";
    if (__DEV__) console.warn("[supabase] " + msg);
    throw new Error(msg);
  }
  return `${base}${SUPABASE_FUNCTIONS_PATH}`;
};
