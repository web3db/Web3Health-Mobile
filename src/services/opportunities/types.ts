// src/services/marketplace/types.ts

// ──────────────────────────────────────────────────────────────────────────────
// Reward (UI-side)
// If you want badge to be optional (safer with current backend), keep it optional.
export type Reward = {
  badge?: string;        // e.g. "Sleep Contributor" (not currently returned by API)
  credits?: number;      // e.g. 50
  typeId?: number | null;
};

// Helper UI types for named entities
export type OpportunityMetric = { id: number; name: string };
export type OpportunityHealthCondition = { id: number; name: string };
export type OpportunityPolicy = { id: number; name: string };

// ──────────────────────────────────────────────────────────────────────────────
// === Raw DTO from your Edge Function ===
// Supports both LIST and DETAIL (detail adds optional fields)
export type PostingDTO = {
  postingId: number;
  title: string;

  // text
  summary?: string | null;
  description?: string | null;

  // media / buyer
  imageUrl?: string | null;
  buyer?: { userId?: number; displayName?: string | null } | null;

  // status / timing
  postingStatusId?: number;
  applyOpenAt?: string | null;
  applyCloseAt?: string | null;
  daysRemaining?: number | null;
  createdOn?: string | null;

  // reward
  reward?: { rewardTypeId?: number; value?: number | null } | null;

  // data requirements
  dataCoverageDaysRequired?: number | null;
  metricIds?: number[];
  metrics?: { id: number; name: string }[];

  // eligibility
  minAge?: number | null;
  maxAge?: number | null;
  healthConditionIds?: number[];
  healthConditions?: { id: number; name: string }[];

  // policies
  viewPolicyIds?: number[];
  viewPolicies?: { id: number; name: string }[];

  // tags
  tags?: string[];

  // links
  applyUrl?: string | null;
  privacyUrl?: string | null;
  termsUrl?: string | null;
};

export type PostingsPageDTO = {
  page: number;
  pageSize: number;
  hasNext: boolean;
  items: PostingDTO[];
};

// ──────────────────────────────────────────────────────────────────────────────
// === UI-facing shape (what cards/screens expect) ===
export type Opportunity = {
  id: string;                 // mapped from postingId
  title: string;

  // text
  summary?: string | null;    // prefer short text for cards
  description?: string | null;// richer detail

  // media / buyer
  imageUrl?: string | null;
  sponsor?: string | null;    // buyer.displayName

  // reward
  reward?: {
    credits?: number | null;  // mapped from reward.value
    typeId?: number | null;   // mapped from reward.rewardTypeId
    badge?: string | null;    // reserved, not currently provided
    typeName?: string | null; // mapped from reward.rewardTypeName (detail only)
  };

  // status / timing
  createdAt?: string | null;  // createdOn
  applyOpenAt?: string | null;
  applyCloseAt?: string | null;
  daysRemaining?: number | null;

  // list vs full
  detailLevel?: "list" | "full";

  // requirements
  dataCoverageDaysRequired?: number | null;

  // metrics (prefer names; fallback to IDs)
  metricIds?: number[];
  metrics?: OpportunityMetric[];

  // eligibility
  minAge?: number | null;
  maxAge?: number | null;
  healthConditionIds?: number[];
  healthConditions?: OpportunityHealthCondition[];

  // policies
  viewPolicyIds?: number[];
  viewPolicies?: OpportunityPolicy[];

  // tags
  tags?: string[];

  // links
  applyUrl?: string | null;
  privacyUrl?: string | null;
  termsUrl?: string | null;
};
