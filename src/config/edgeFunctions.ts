// src/config/edgeFunctions.ts
import { getFunctionsBase } from "./supabase";

const buildQs = (qs?: Record<string, unknown>) =>
  qs
    ? "?" +
      Object.entries(qs)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";

export const fns = {
  url(name: string, qs?: Record<string, unknown>) {
    const base = getFunctionsBase(); // will throw with a helpful message if misconfigured
    const clean = name.replace(/^\/+/, "");
    const built = `${base}/${clean}${buildQs(qs)}`;
    if (__DEV__) console.log("[fns.url]", built);
    return built;
  },

  async fetch<T = unknown>(
    name: string,
    init?: RequestInit & { query?: Record<string, unknown> }
  ): Promise<T> {
    const { query, headers, body, ...rest } = init || {};
    const url = this.url(name, query);
    try {
      const res = await fetch(url, {
        ...rest,
        headers: { "Content-Type": "application/json", ...(headers || {}) },
        body: body && typeof body !== "string" ? JSON.stringify(body) : (body as any),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`fn ${name} | ${res.status} ${res.statusText} ${text}`);
      }
      if (res.status === 204) return undefined as T;
      const ct = res.headers.get("content-type") || "";
      return ct.includes("application/json")
        ? ((await res.json()) as T)
        : ((await res.text()) as unknown as T);
    } catch (e) {
      if (__DEV__) console.warn("[fns.fetch] error for", url, e);
      throw e;
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Centralized mapping for Supabase Edge Function endpoints
// ─────────────────────────────────────────────────────────────────────────────
const EDGE_BASE =
  process.env.EXPO_PUBLIC_SUPABASE_EDGE_BASE ||
  "https://jkyctppxygjhsqwmbyvb.supabase.co/functions/v1";

export const EDGE_FUNCTIONS = {
  // Masters
  races: `${EDGE_BASE}/races`,
  sexes: `${EDGE_BASE}/sexes`,
  measurement_systems: `${EDGE_BASE}/measurement_systems`,
  units: `${EDGE_BASE}/units`,
  health_conditions: `${EDGE_BASE}/health_conditions`,

  // Users
  users_create: `${EDGE_BASE}/users_create`,
  users_profile: `${EDGE_BASE}/users_profile`,   
  users_update: `${EDGE_BASE}/users_update`,     
  user_login_profile_by_clerk_id: `${EDGE_BASE}/user_login_profile_by_clerk_id`,
  // Sharing / Rewards
  user_rewards_summary: `${EDGE_BASE}/user_rewards_summary`,


  // (Optional) share endpoints could live here too...
   // (Optional) If you want to also centralize sharing endpoints here, mirror your existing keys:
  // user_start_share_session: `${EDGE_BASE}/user_start_share_session`,
  // user_get_session_by_posting: `${EDGE_BASE}/user_get_session_by_posting`,
  // user_submit_segment: `${EDGE_BASE}/user_submit_segment`,
  // user_cancel_share_session: `${EDGE_BASE}/user_cancel_share_session`,
  // user_get_sharing_dashboard: `${EDGE_BASE}/user_get_sharing_dashboard`,
} as const;

export type EdgeFunctionKey = keyof typeof EDGE_FUNCTIONS;
export const getEdgeUrl = (key: EdgeFunctionKey) => EDGE_FUNCTIONS[key];
