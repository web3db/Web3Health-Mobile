// src/services/sharing/api.ts
import { buildUrl, fetchJson } from "./base";
import type { SegmentPayload } from "./producer";
import {
  CancelReq,
  CancelRes,
  DashboardRes,
  ResolverRes,
  RewardsSummaryRes,
  SessionSnapshotRes,
  StartSessionRes,
  SubmitSegmentReq,
  SubmitSegmentRes,
  type TResolverRes,
  type TRewardsSummaryRes,
} from "./schema";

import type { UploadSegmentResult } from "./types";

/** Start (create) a session.
 *  NOTE: store passes joinTimeLocalISO → we must map to server's `joinTimeLocal`.
 */
export async function createSession(
  postingId: number,
  userId: number,
  params: {
    segmentsExpected?: number;
    joinTimeLocalISO: string;
    joinTimezone: string;
    cycleAnchorUtc: string;
  }
): Promise<{
  sessionId: number;
  cycleAnchorUtc: string;
  segmentsExpected: number;
  joinTimeLocalISO: string;
  joinTimezone: string;
}> {
  const url = buildUrl("user_start_share_session");
  const body = {
    postingId,
    userId,
    joinTimeLocal: params.joinTimeLocalISO, // map name
    joinTimezone: params.joinTimezone,
    cycleAnchorUtc: params.cycleAnchorUtc,
    segmentsExpected: params.segmentsExpected,
  };

  const { ok, status, json, text } = await fetchJson("POST", url, body);
  if (!ok || !json) {
    throw new Error(
      `user_start_share_session ${status} ${String((json as any)?.message ?? text ?? "")}`
    );
  }
  const parsed = StartSessionRes.parse(json);
  return {
    sessionId: parsed.sessionId,
    cycleAnchorUtc: parsed.cycleAnchorUtc,
    segmentsExpected: parsed.segmentsExpected,
    joinTimeLocalISO: parsed.joinTimeLocal,
    joinTimezone: parsed.joinTimezone,
  };
}

/** Resolve a session by (postingId, userId). Prefer ACTIVE, else latest. */
export async function getSessionByPosting(
  postingId: number,
  userId: number
): Promise<TResolverRes | null> {
  const url = buildUrl("user_get_session_by_posting", { postingId, userId });
  const { ok, status, json } = await fetchJson("GET", url);
  if (!ok) {
    if (status === 404) return null;
    throw new Error(
      `user_get_session_by_posting ${status} ${String((json as any)?.message ?? "")}`
    );
  }
  return ResolverRes.parse(json);
}

/** Upload a segment payload (called from producer). */
export async function uploadSegment(
  payload: SegmentPayload
): Promise<UploadSegmentResult> {
  // Shape already matches server expectations
  const url = buildUrl("user_submit_segment");
  const req = SubmitSegmentReq.parse({
    sessionId: payload.sessionId,
    dayIndex: payload.dayIndex,
    fromUtc: payload.fromUtc,
    toUtc: payload.toUtc,
    hasData: payload.hasData,
    metrics: payload.metrics,
  });

  const { ok, status, json, text } = await fetchJson("POST", url, req);

  // Treat 409 duplicates as idempotent success
  if (!ok && status === 409) {
    if (__DEV__)
      console.log(
        "[sharing.api] submit_segment idempotent 409 → treating as ok"
      );
    return { ok: true, status: "ACTIVE" };
  }

  if (!ok || !json) {
    return {
      ok: false,
      error: `user_submit_segment ${status} ${String((json as any)?.message ?? text ?? "")}`,
    };
  }

  const parsed = SubmitSegmentRes.parse(json);
  const serverStatus = parsed.sessionStatusName?.toUpperCase?.() || "ACTIVE";
  const norm: UploadSegmentResult = {
    ok: true,
    status: serverStatus === "COMPLETED" ? "COMPLETE" : "ACTIVE",
  };
  return norm;
}

/** Cancel a session. */
export async function cancelShareSession(sessionId: number): Promise<{
  ok: boolean;
  status: "CANCELLED" | "ACTIVE";
  error?: string;
}> {
  const url = buildUrl("user_cancel_share_session");
  const req = CancelReq.parse({ sessionId });

  const { ok, status, json, text } = await fetchJson("POST", url, req);

  if (!ok) {
    // 409 means COMPLETED cannot be cancelled
    if (status === 409) {
      return { ok: false, status: "ACTIVE", error: "COMPLETED" };
    }
    return {
      ok: false,
      status: "ACTIVE",
      error: `user_cancel_share_session ${status} ${String(
        (json as any)?.message ?? text ?? ""
      )}`,
    };
  }

  const parsed = CancelRes.parse(json);
  return { ok: true, status: parsed.statusName };
}

/** Dashboard counters for the Sharing tab. */
export async function getSharingDashboard(userId: number) {
  const url = buildUrl("user_get_sharing_dashboard", { userId });
  const { ok, status, json, text } = await fetchJson("GET", url);
  if (!ok || !json) {
    throw new Error(
      `user_get_sharing_dashboard ${status} ${String((json as any)?.message ?? text ?? "")}`
    );
  }
  const parsed = DashboardRes.parse(json);
  return parsed;
}

/** Session snapshot for an (userId, postingId). */
export async function getSessionSnapshot(userId: number, postingId: number) {
  const url = buildUrl("share_get_session_snapshot", { userId, postingId });
  const { ok, status, json, text } = await fetchJson("GET", url);
  if (!ok || !json) {
    throw new Error(
      `share_get_session_snapshot ${status} ${String((json as any)?.message ?? text ?? "")}`
    );
  }
  const parsed = SessionSnapshotRes.parse(json);
  return parsed;
}


// === [GET_REWARDS_SUMMARY] call user_rewards_summary with ?userId=
export async function getRewardsSummary(userId: number): Promise<TRewardsSummaryRes> {
  const url = buildUrl("user_rewards_summary", { userId });
  const { ok, status, json, text } = await fetchJson("GET", url);
  if (!ok || !json) {
    throw new Error(
      `user_rewards_summary ${status} ${String((json as any)?.message ?? text ?? "")}`
    );
  }
  return RewardsSummaryRes.parse(json);
}
