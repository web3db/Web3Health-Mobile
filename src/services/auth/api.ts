import { z } from 'zod';
import { buildUrl, fetchJson } from '../http/base';

// ─────────────────────────────────────────────────────────────────────────────
// Lookup (email → userId) via /auth_lookup
// ─────────────────────────────────────────────────────────────────────────────
const LookupOkZ = z.object({
  ok: z.literal(true),
  userId: z.number().int(),
});
const LookupErrZ = z.object({
  ok: z.literal(false),
  error: z.string(),
});

export async function lookupUserIdByEmail(rawEmail: string): Promise<number | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) throw new Error('Email is required');

  const url = buildUrl('auth_lookup');
  const { ok, status, json, text } = await fetchJson('POST', url, { email });

  // Dev contract: 404 means "not found" → return null so caller can route to /auth/register
  if (status === 404) return null;

  if (!ok || !json) {
    throw new Error(`auth_lookup ${status} ${String(text ?? '')}`);
  }

  // Parse success-or-error explicitly (the function should never return ok:false on 2xx)
  if (LookupOkZ.safeParse(json).success) {
    const { userId } = LookupOkZ.parse(json);
    return userId;
  }

  const err = LookupErrZ.safeParse(json).success
    ? LookupErrZ.parse(json).error
    : 'Unknown error';
  throw new Error(err);
}

/** Helper if you prefer throwing on 404 instead of returning null */
export async function requireUserIdByEmail(email: string): Promise<number> {
  const id = await lookupUserIdByEmail(email);
  if (id == null) throw new Error('User not found');
  return id;
}
