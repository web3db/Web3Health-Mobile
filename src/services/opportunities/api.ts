// src/services/opportunities/api.ts
import type { PostingsPageDTO } from "./dto";
import { mapPostingToOpportunity } from "./mapper";
import type { Opportunity } from "./types";

export type ListParams = {
  page?: number;
  pageSize?: number;
  // future: tag?: string; sort?: string;
};

export const FUNCTIONS_BASE =
  "https://jkyctppxygjhsqwmbyvb.supabase.co/functions/v1";

function buildQuery(qs?: Record<string, unknown>) {
  if (!qs) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (v !== undefined && v !== null && v !== "") sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function buildUrl(name: string, qs?: Record<string, unknown>) {
  const clean = name.replace(/^\/+/, "");
  return `${FUNCTIONS_BASE}/${clean}${buildQuery(qs)}`;
}

/** LIST (paged) */
export async function listMarketplacePostings(
  params: ListParams = {}
): Promise<{ page: number; pageSize: number; hasNext: boolean; items: Opportunity[] }> {
  const u = buildUrl("marketplace_postings", params as Record<string, unknown>);
  if (__DEV__) console.log("[listMarketplacePostings] GET", u);

  const res = await fetch(u, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (__DEV__) console.warn("[listMarketplacePostings] ✗", res.status, res.statusText, txt);
    throw new Error(`marketplace_postings ${res.status} ${res.statusText} ${txt}`);
  }

  const dto = (await res.json()) as PostingsPageDTO;
  const items = Array.isArray(dto.items)
    ? dto.items.map((p: any) => mapPostingToOpportunity(p, "list"))
    : [];

  if (__DEV__) {
    console.log(
      `[listMarketplacePostings] ✓ page=${dto.page} items=${items.length} hasNext=${dto.hasNext}`
    );
  }

  return {
    page: dto.page,
    pageSize: dto.pageSize,
    hasNext: dto.hasNext,
    items,
  };
}

/** DETAIL (single) — ONLY postingId is allowed */
export async function getMarketplacePostingById(
  postingId: string | number
): Promise<Opportunity | null> {
  const u = buildUrl("marketplace_postings", { postingId: String(postingId) });
  if (__DEV__) console.log("[getMarketplacePostingById] GET", u);

  let res: Response;
  try {
    res = await fetch(u, { method: "GET", headers: { "Content-Type": "application/json" } });
  } catch (e) {
    if (__DEV__) console.warn("[getMarketplacePostingById] network error:", e);
    return null;
  }

  if (!res.ok) {
    // Optional: keep 404 quiet; warn on others
    const txt = await res.text().catch(() => "");
    if (res.status !== 404 && __DEV__) {
      console.warn("[getMarketplacePostingById] ✗", res.status, res.statusText, txt);
    }
    return null;
  }

  const json: unknown = await res.json();

  // Accept BOTH shapes:
  //  A) page wrapper: { page, pageSize, hasNext, items: [...] }
  //  B) single object: { postingId, title, ... }
  const isPageWrapper =
    !!json &&
    typeof json === "object" &&
    Array.isArray((json as any).items) &&
    (json as any).items.length > 0;

  const isSingleObject =
    !!json &&
    typeof json === "object" &&
    typeof (json as any).postingId === "number";

  const raw = isPageWrapper
    ? (json as any).items[0]
    : isSingleObject
    ? json
    : null;

  if (!raw) {
    if (__DEV__) console.log("[getMarketplacePostingById] no item in response for postingId", postingId);
    return null;
  }

  const mapped = mapPostingToOpportunity(raw as any, "full");
  if (__DEV__) console.log(`[getMarketplacePostingById] ✓ id=${mapped.id} title="${mapped.title}"`);
  return mapped;
}
