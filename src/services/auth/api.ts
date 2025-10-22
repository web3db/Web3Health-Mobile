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
