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
