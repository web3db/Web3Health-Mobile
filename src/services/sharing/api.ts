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

import type { ActiveShareSessionDto, UploadSegmentResult } from "./types";
const TAG = "[sharing.api]";

function assertIsoHasNumericOffset(label: string, iso: string) {
  if (typeof iso !== "string" || iso.length < 10) {
    throw new Error(`${TAG} ${label}: expected string ISO, got ${String(iso)}`);
  }
  // Require numeric offset for "local ISO" fields (e.g. 2026-02-10T12:34:56.000-05:00)
  if (!/[+-]\d{2}:\d{2}$/.test(iso)) {
    throw new Error(`${TAG} ${label}: missing numeric offset (±HH:MM): ${iso}`);
  }
}
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
  },
): Promise<{
  sessionId: number;
  cycleAnchorUtc: string;
  segmentsExpected: number;
  joinTimeLocalISO: string;
  joinTimezone: string;
}> {
  const url = buildUrl("user_start_share_session");
  assertIsoHasNumericOffset(
    "createSession joinTimeLocalISO",
    params.joinTimeLocalISO,
  );

  const body: any = {
    postingId,
    userId,
    joinTimeLocal: params.joinTimeLocalISO, // map name
    joinTimezone: params.joinTimezone,
    segmentsExpected: params.segmentsExpected,
  };

  if (params.cycleAnchorUtc) {
    body.cycleAnchorUtc = params.cycleAnchorUtc;
  }

  const { ok, status, json, text } = await fetchJson("POST", url, body);
  if (!ok || !json) {
    throw new Error(
      `user_start_share_session ${status} ${String((json as any)?.message ?? text ?? "")}`,
    );
  }
  const parsed = StartSessionRes.parse(json);
  assertIsoHasNumericOffset(
    "createSession response joinTimeLocalISO",
    parsed.joinTimeLocal,
  );

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
  userId: number,
): Promise<TResolverRes | null> {
  const url = buildUrl("user_get_session_by_posting", { postingId, userId });
  const { ok, status, json } = await fetchJson("GET", url);
  if (!ok) {
    if (status === 404) return null;
    throw new Error(
      `user_get_session_by_posting ${status} ${String((json as any)?.message ?? "")}`,
    );
  }
  return ResolverRes.parse(json);
}

/** Upload a segment payload (called from producer). */
export async function uploadSegment(
  payload: SegmentPayload,
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
        "[sharing.api] submit_segment idempotent 409 → treating as ok",
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

/**
 * Cancel a session on the backend via user_cancel_share_session.
 *
 * Used in two places:
 * - useShareStore.cancelCurrentSession      → user-initiated cancel.
 * - useShareStore.tryProcessWindow (auto)   → engine-driven auto-cancel sync.
 *
 * Returns:
 * - { ok: true,  status: "CANCELLED" }  when backend confirms cancellation.
 * - { ok: false, status: "ACTIVE", error: "COMPLETED" } when server reports the
 *   session is already completed (HTTP 409).
 * - { ok: false, status: "ACTIVE", error: string } for other failures.
 */

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
        (json as any)?.message ?? text ?? "",
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
      `user_get_sharing_dashboard ${status} ${String((json as any)?.message ?? text ?? "")}`,
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
      `share_get_session_snapshot ${status} ${String((json as any)?.message ?? text ?? "")}`,
    );
  }

  const parsed = SessionSnapshotRes.parse(json);

  const s = parsed.session;
  if (s?.join_time_local_iso) {
    assertIsoHasNumericOffset(
      "getSessionSnapshot join_time_local_iso",
      s.join_time_local_iso,
    );
  }

  // TEMP debug: verify server-authoritative next_due + catch_up + wake_at_utc are flowing through.
  // Remove once stable.
  if (__DEV__) {
    const s = parsed.session;
    const nd = s?.next_due;
    const cu = (s as any)?.catch_up;
    const cuNext = cu?.next ?? null;

    console.log("[sharing.api] snapshot", {
      session_id: s?.session_id ?? null,
      last_sent_day_index: s?.last_sent_day_index ?? null,
      join_timezone: s?.join_timezone ?? null,
      join_local_date: s?.join_local_date ?? null,
      grace_minutes: s?.grace_minutes ?? null,

      catch_up: cu
        ? {
            count_eligible_now: cu.count_eligible_now ?? null,
            next: cuNext
              ? {
                  day_index: cuNext.day_index,
                  eligible_at_utc: cuNext.eligible_at_utc,
                  is_eligible: cuNext.is_eligible,
                  from_utc: cuNext.from_utc,
                  to_utc: cuNext.to_utc,
                }
              : null,
          }
        : null,

      next_due: nd
        ? {
            day_index: nd.day_index,
            eligible_at_utc: nd.eligible_at_utc,
            is_eligible: nd.is_eligible,
            from_utc: nd.from_utc,
            to_utc: nd.to_utc,
          }
        : null,

      wake_at_utc: (s as any)?.wake_at_utc ?? null,
    });
  }

  return parsed;
}

// === [GET_REWARDS_SUMMARY] call user_rewards_summary with ?userId=
export async function getRewardsSummary(
  userId: number,
): Promise<TRewardsSummaryRes> {
  const url = buildUrl("user_rewards_summary", { userId });
  const { ok, status, json, text } = await fetchJson("GET", url);
  if (!ok || !json) {
    throw new Error(
      `user_rewards_summary ${status} ${String((json as any)?.message ?? text ?? "")}`,
    );
  }
  return RewardsSummaryRes.parse(json);
}

// === [GET_ACTIVE_SHARE_SESSIONS] call user_active-share-sessions with ?userId=
export async function getActiveShareSessions(
  userId: number,
): Promise<ActiveShareSessionDto[]> {
  const url = buildUrl("user_active-share-sessions", { userId });
  const { ok, status, json, text } = await fetchJson("GET", url);

  if (!ok || !json) {
    throw new Error(
      `user_active-share-sessions ${status} ${String(
        (json as any)?.message ?? text ?? "",
      )}`,
    );
  }

  // Edge Function returns an array of ActiveShareSessionDto objects.
  // We trust the backend shape here and cast to the DTO type.
  return json as ActiveShareSessionDto[];
}
