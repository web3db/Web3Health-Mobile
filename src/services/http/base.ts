// src/services/http/base.ts
export const FUNCTIONS_BASE =
  process.env.EXPO_PUBLIC_FUNCTIONS_BASE ??
  "https://jkyctppxygjhsqwmbyvb.supabase.co/functions/v1";

export function buildQuery(qs?: Record<string, unknown>) {
  if (!qs) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function buildUrl(name: string, qs?: Record<string, unknown>) {
  const clean = name.replace(/^\/+/, "");
  return `${FUNCTIONS_BASE}/${clean}${buildQuery(qs)}`;
}

type Json = Record<string, unknown> | unknown[] | null;

export async function fetchJson<T = any>(
   method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; json: T | null; text?: string }> {
  if (__DEV__) console.log(`[sharing.fetchJson] ${method} ${url}`, body ?? "");
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const payload = isJson ? ((await res.json().catch(() => null)) as Json) : null;
  const text = !isJson ? await res.text().catch(() => "") : undefined;

  if (!res.ok && __DEV__) {
    console.warn(
      "[sharing.fetchJson] ✗",
      res.status,
      res.statusText,
      isJson ? payload : text
    );
  }
  return { ok: res.ok, status: res.status, json: payload as any, text };
}
