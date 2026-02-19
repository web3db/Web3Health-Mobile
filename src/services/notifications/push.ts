import { buildUrl, fetchJson } from "@/src/services/http/base";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
export async function registerExpoPushToken(params: { clerkId: string }) {
  // Expo docs: push tokens require a real device (not simulator)
  if (!Device.isDevice) {
    if (__DEV__)
      console.log("[push] skipped: not a physical device (simulator/emulator)");
    return { ok: false as const, reason: "not_a_device" as const };
  }

  // 1) Permissions
  const perm = await Notifications.getPermissionsAsync();
  let status = perm.status;

  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }

  if (status !== "granted") {
    return { ok: false as const, reason: "permission_denied" as const };
  }

  // 2) Expo push token
  const projectId =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants.easConfig as any)?.projectId;

  if (!projectId) {
    throw new Error(
      "Expo projectId not found (extra.eas.projectId / easConfig.projectId)",
    );
  }
  const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });

  const expoPushToken = tokenRes.data;
  if (__DEV__) console.log("[push] got expo token", expoPushToken);

  // 3) Send to your Edge Function
  const url = buildUrl("push_register");
  const body = {
    clerkId: params.clerkId,
    expoPushToken,
    platform: Platform.OS,
  };

  const {
    ok,
    status: httpStatus,
    json,
    text,
  } = await fetchJson("POST", url, body);
  if (!ok) {
    throw new Error(
      `push_register ${httpStatus} ${String(text ?? (json as any)?.message ?? "")}`,
    );
  }

  return { ok: true as const, expoPushToken };
}
