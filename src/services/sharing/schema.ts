import { z } from "zod";

// Strict ISO helpers.
// - "Local ISO" MUST end with numeric offset (±HH:MM).
// - "UTC ISO" MUST end with Z.
const ISO_LOCAL_WITH_OFFSET = z
  .string()
  .regex(
    /[+-]\d{2}:\d{2}$/,
    "Expected ISO string with numeric offset (±HH:MM)",
  );

const ISO_UTC_Z = z
  .string()
  .regex(/Z$/, "Expected UTC ISO string ending with 'Z'");

export const ApplicationStatus = z.enum([
  "APPLIED",
  "PENDING",
  "ACCEPTED",
  "REJECTED",
]);

export const ShareChannel = z.object({
  id: z.string(),
  label: z.string(),
  scope: z.enum(["READ", "WRITE"]),
});

export const ActiveShare = z.object({
  id: z.string(),
  studyId: z.string(),
  studyTitle: z.string(),
  channels: z.array(ShareChannel),
  sinceISO: z.string(), // ISO date
});

export const Application = z.object({
  id: z.string(),
  studyId: z.string(),
  studyTitle: z.string(),
  appliedAtISO: z.string(),
  status: ApplicationStatus,
  note: z.string().optional(),
});

export const Badge = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  earnedAtISO: z.string(),
  valueUSD: z.number(),
});

export const EarningsSummary = z.object({
  totalUSD: z.number(),
  badgesCount: z.number(),
});

export const ShareState = z.object({
  applications: z.array(Application),
  activeShares: z.array(ActiveShare),
  badges: z.array(Badge),
  earnings: EarningsSummary,
});

export type TShareState = z.infer<typeof ShareState>;

/** ---------- start session ---------- */
// export const StartSessionReq = z.object({
//   postingId: z.number().int(),
//   userId: z.number().int(),
//   joinTimeLocal: z.string(), // ISO with offset
//   joinTimezone: z.string(),
//   cycleAnchorUtc: z.string(), // ISO Z
//   segmentsExpected: z.number().int().min(1),
// });

export const StartSessionReq = z.object({
  postingId: z.number().int(),
  userId: z.number().int(),
  joinTimeLocal: ISO_LOCAL_WITH_OFFSET, // ISO with numeric offset (±HH:MM)
  joinTimezone: z.string(),
  cycleAnchorUtc: ISO_UTC_Z, // UTC ISO ending in Z
  segmentsExpected: z.number().int().min(1),
});

export const StartSessionRes = z.object({
  sessionId: z.number().int(),
  postingId: z.number().int(),
  postingTitle: z.string().nullable().optional(),
  userId: z.number().int(),
  userDisplayName: z.string().nullable().optional(),
  statusId: z.number().int(),
  statusName: z.string(),
  segmentsExpected: z.number().int(),
  segmentsSent: z.number().int(),
  joinTimeLocal: ISO_LOCAL_WITH_OFFSET,
  joinTimezone: z.string(),
  cycleAnchorUtc: ISO_UTC_Z,
  permissionGranted: z.boolean(),
  createdOnUtc: z.string().nullable().optional(),
});

/** ---------- resolver ---------- */
export const ResolverRes = z.object({
  sessionId: z.number().int(),
  postingId: z.number().int(),
  postingTitle: z.string().nullable().optional(),
  userId: z.number().int(),
  userDisplayName: z.string().nullable().optional(),
  statusId: z.number().int(),
  statusName: z.string().nullable().optional(),
  segmentsExpected: z.number().int(),
  segmentsSent: z.number().int(),
  createdOnUtc: z.string().nullable().optional(),
  modifiedOnUtc: z.string().nullable().optional(),
  source: z.enum(["ACTIVE", "LATEST"]),
});

/** ---------- submit segment ---------- */
export const SegmentMetric = z.object({
  metricId: z.number().int(),
  unitCode: z.string(),
  totalValue: z.number().nullable().optional(),
  avgValue: z.number().nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  samplesCount: z.number().nullable().optional(),
  computedJson: z.any().nullable().optional(),
});

// export const SubmitSegmentReq = z.object({
//   sessionId: z.number().int(),
//   dayIndex: z.number().int(),
//   fromUtc: z.string(), // ISO
//   toUtc: z.string(), // ISO
//   hasData: z.boolean(),
//   metrics: z.array(SegmentMetric),
// });

export const SubmitSegmentReq = z.object({
  sessionId: z.number().int(),
  dayIndex: z.number().int(),
  fromUtc: ISO_UTC_Z,
  toUtc: ISO_UTC_Z,
  hasData: z.boolean(),
  metrics: z.array(SegmentMetric),
});

export const SubmitSegmentRes = z.object({
  segmentId: z.number().int(),
  sessionId: z.number().int(),
  dayIndex: z.number().int(),
  segmentsSent: z.number().int(),
  segmentsExpected: z.number().int(),
  sessionStatusId: z.number().int(),
  sessionStatusName: z.string(),
  ack: z.enum(["accepted", "accepted_no_metrics", "accepted_completed"]),
});

/** ---------- cancel ---------- */
export const CancelReq = z.object({
  sessionId: z.number().int(),
});

export const CancelRes = z.object({
  sessionId: z.number().int(),
  statusId: z.number().int(),
  statusName: z.literal("CANCELLED"),
  ack: z.enum(["cancelled", "already_cancelled"]),
});

/** ---------- dashboard ---------- */
export const DashboardRes = z.object({
  userId: z.number().int(),
  userDisplayName: z.string().nullable().optional(),
  sharedPostingsCount: z.number().int(),
  activeCount: z.number().int(),
  completedCount: z.number().int(),
  cancelledCount: z.number().int(),
});

// ---------- session snapshot ----------
// const NextDue = z.object({
//   day_index: z.number().int(),
//   from_utc: z.string(),
//   to_utc: z.string(),
//   eligible_at_utc: z.string(),
//   is_eligible: z.boolean(),
// });

// ---------- session snapshot ----------
// const Window = z.object({
//   day_index: z.number().int(),
//   from_utc: z.string(),
//   to_utc: z.string(),
//   eligible_at_utc: z.string(),
//   is_eligible: z.boolean(),
// });

const Window = z.object({
  day_index: z.number().int(),
  from_utc: ISO_UTC_Z,
  to_utc: ISO_UTC_Z,
  eligible_at_utc: ISO_UTC_Z,
  is_eligible: z.boolean(),
});

const CatchUp = z.object({
  count_eligible_now: z.number().int(),
  next: Window.nullable(),
});

export const SessionSnapshotRes = z.object({
  ok: z.literal(true),
  session: z
    .object({
      session_id: z.number().int(),
      posting_id: z.number().int(),
      user_id: z.number().int(),
      status_code: z.string().nullable(),
      status_name: z.string().nullable(),
      segments_expected: z.number().int(),
      segments_sent: z.number().int(),
      last_sent_day_index: z.number().int().nullable(),
      cycle_anchor_utc: ISO_UTC_Z,
      join_time_local_iso: ISO_LOCAL_WITH_OFFSET,
      join_timezone: z.string(), // IANA
      join_local_date: z.string().nullable(),
      // grace_minutes: z.number().int().optional(),
      // next_due: NextDue.nullable().optional(),
      // last_uploaded_at: z.string().nullable(),
      // last_window_from_utc: z.string().nullable(),
      // last_window_to_utc: z.string().nullable(),
      grace_minutes: z.number().int().optional(),

      // Normal next due window (server-authoritative)
      next_due: Window.nullable().optional(),

      // Catch-up plan (server-authoritative)
      catch_up: CatchUp.optional(),

      // Earliest time the client should wake to re-check eligibility (server hint)
      wake_at_utc: ISO_UTC_Z.nullable().optional(),

      last_uploaded_at: ISO_UTC_Z.nullable(),
      last_window_from_utc: ISO_UTC_Z.nullable(),
      last_window_to_utc: ISO_UTC_Z.nullable(),
    })
    .nullable(),
});

// === [REWARDS_ZOD] Rewards summary payload (from user_rewards_summary)
export const RewardsPromotion = z.object({
  promoKind: z.string().optional(), // "INLINE"
  rewardTypeCode: z.string(), // e.g., "FOUNDERS", "TOKENS"
  rewardTypeName: z.string(),
  amount: z.number(),
  reason: z.string().nullable().optional(),
  grantedVirtualAt: z.string().nullable().optional(),
});

export const RewardsPostingItem = z.object({
  postingId: z.number(),
  title: z.string().nullable(),
  rewardTypeId: z.number().nullable(),
  rewardTypeCode: z.string(),
  rewardTypeName: z.string(),
  rewardValue: z.number(),
  completedAt: z.string().nullable(),
});

export const RewardsBreakdownItem = z.object({
  code: z.string(),
  displayName: z.string(),
  postingsCompleted: z.number(),
  totalValue: z.number(),
});

export const RewardsTotals = z.object({
  overallValueByType: z.record(z.string(), z.number()),
  overallCountByType: z.record(z.string(), z.number()),
  grandTotals: z.object({
    postings: z.number(), // number of completed postings
    value: z.number(), // includes promotional value
  }),
});

export const RewardsSummaryRes = z.object({
  userId: z.number(),
  userDisplayName: z.string().nullable().optional(),
  totals: RewardsTotals,
  breakdown: z.array(RewardsBreakdownItem),
  promotions: z.array(RewardsPromotion).optional().default([]),
  postings: z.array(RewardsPostingItem),
  badges: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      count: z.number(),
    }),
  ),
  generatedAt: z.string(),
  sourceNotes: z.any().optional(),
});

// ---------- types ----------
export type TSessionSnapshotRes = z.infer<typeof SessionSnapshotRes>;
export type TStartSessionReq = z.infer<typeof StartSessionReq>;
export type TStartSessionRes = z.infer<typeof StartSessionRes>;
export type TResolverRes = z.infer<typeof ResolverRes>;
export type TSubmitSegmentReq = z.infer<typeof SubmitSegmentReq>;
export type TSubmitSegmentRes = z.infer<typeof SubmitSegmentRes>;
export type TCancelReq = z.infer<typeof CancelReq>;
export type TCancelRes = z.infer<typeof CancelRes>;
export type TDashboardRes = z.infer<typeof DashboardRes>;
export type TRewardsSummaryRes = z.infer<typeof RewardsSummaryRes>;
