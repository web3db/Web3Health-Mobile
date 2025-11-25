import { getEdgeUrl } from "@/src/config/edgeFunctions";
import { z } from 'zod';
import { buildUrl, fetchJson } from '../http/base';
// ─────────────────────────────────────────────────────────────────────────────
// Lookup (email → user) via /auth_lookup  [now returns name too]
// ─────────────────────────────────────────────────────────────────────────────
const LookupOkZ = z.object({
  ok: z.literal(true),
  userId: z.number().int(),
  name: z.string().nullable().optional(), // NEW
});
const LookupErrZ = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export type LookupUser = {
  userId: number;
  name: string | null; // null/empty if not set
};

/**
 * Preferred: returns `{ userId, name }` or `null` when not found (404).
 * Uses POST per your existing contract.
 */
export async function lookupUserByEmail(rawEmail: string): Promise<LookupUser | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) throw new Error('Email is required');

  const url = buildUrl('auth_lookup');
  const { ok, status, json, text } = await fetchJson('POST', url, { email });

  // Dev contract: 404 → not found
  if (status === 404) return null;

  if (!ok || !json) {
    throw new Error(`auth_lookup ${status} ${String(text ?? '')}`);
  }

  // Success path
  if (LookupOkZ.safeParse(json).success) {
    const { userId, name } = LookupOkZ.parse(json);
    return { userId, name: name ?? null };
  }

  // Error body on 2xx (shouldn't happen, but handled)
  const err = LookupErrZ.safeParse(json).success
    ? LookupErrZ.parse(json).error
    : 'Unknown error';
  throw new Error(err);
}

/**
 * Back-compat helper: returns only `userId` (or null on 404).
 * Thin wrapper around the new function to avoid refactors elsewhere.
 */
export async function lookupUserIdByEmail(rawEmail: string): Promise<number | null> {
  const found = await lookupUserByEmail(rawEmail);
  return found ? found.userId : null;
}

/** Helper that throws if not found */
export async function requireUserIdByEmail(email: string): Promise<number> {
  const r = await lookupUserByEmail(email);
  if (!r) throw new Error('User not found');
  return r.userId;
}


// ─────────────────────────────────────────────────────────────────────────────
// ClerkId → MST_User login profile (Edge Function: user_login_profile_by_clerk_id)
// Used by Gate to rehydrate MST_User after reinstall / new device.
// ─────────────────────────────────────────────────────────────────────────────

const LoginProfileUserZ = z.object({
  UserId: z.number(),
  ClerkId: z.string().nullable().optional(),
  Email: z.string().nullable().optional(),
  Name: z.string(),
  BirthYear: z.number().int().nullable().optional(),
  RaceId: z.number().int().nullable().optional(),
  SexId: z.number().int().nullable().optional(),
  HeightNum: z.number().nullable().optional(),
  HeightUnitId: z.number().int().nullable().optional(),
  WeightNum: z.number().nullable().optional(),
  WeightUnitId: z.number().int().nullable().optional(),
  MeasurementSystemId: z.number().int().nullable().optional(),
  RoleId: z.number().int().nullable().optional(),
  IsActive: z.boolean().nullable().optional(),
  CreatedOn: z.string().nullable().optional(),
  ModifiedOn: z.string().nullable().optional(),
});

export type LoginProfileUser = z.infer<typeof LoginProfileUserZ>;

export type LoginProfileResult =
  | { kind: "ok"; user: LoginProfileUser }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

/**
 * Fetch MST_User row for a given ClerkId using the Edge Function
 * `user_login_profile_by_clerk_id`.
 *
 * This function is deliberately non-throwing:
 * - kind === "ok"       → we got a valid MST_User
 * - kind === "not_found"→ 404 from the function
 * - kind === "error"    → network / 5xx / parse issues
 */
export async function fetchLoginProfileByClerkId(
  clerkId: string
): Promise<LoginProfileResult> {
  const trimmed = clerkId?.trim();
  if (!trimmed) {
    return { kind: "error", message: "Missing clerkId" };
  }

  const baseUrl = getEdgeUrl("user_login_profile_by_clerk_id");
  const url = `${baseUrl}?clerkId=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetch(url, { method: "GET" });

    const contentType = res.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await res.json() : await res.text();

    if (res.status === 404) {
      // Edge function returns 404 when MST_User is missing for this ClerkId
      return { kind: "not_found" };
    }

    if (!res.ok) {
      const msg =
        isJson && body && typeof body.error === "string"
          ? body.error
          : `HTTP ${res.status}`;
      if (__DEV__) {
        console.warn(
          "[fetchLoginProfileByClerkId] non-OK",
          res.status,
          msg
        );
      }
      return { kind: "error", message: msg };
    }

    const parsed = LoginProfileUserZ.safeParse(body);
    if (!parsed.success) {
      if (__DEV__) {
        console.warn(
          "[fetchLoginProfileByClerkId] invalid payload",
          parsed.error
        );
      }
      return { kind: "error", message: "Invalid login profile payload" };
    }

    return { kind: "ok", user: parsed.data };
  } catch (e: any) {
    if (__DEV__) {
      console.warn("[fetchLoginProfileByClerkId] request failed", e);
    }
    return {
      kind: "error",
      message: e?.message ?? "Network or unexpected error",
    };
  }
}
