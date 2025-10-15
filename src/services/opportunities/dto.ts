// src/services/opportunities/dto.ts
export type PostingDTO = {
  postingId: number;
  title: string;

  // text
  summary?: string | null;
  description?: string | null;

  // media / buyer
  imageUrl?: string | null;
  buyer?: { userId?: number; displayName?: string | null } | null;
  buyerId?: number;                 // detail alt
  buyerName?: string | null;        // detail alt

  // status / timing
  postingStatusId?: number;
  postingStatusCode?: string;       // detail alt
  applyOpenAt?: string | null;
  applyCloseAt?: string | null;
  daysRemaining?: number | null;
  createdOn?: string | null;

  // reward (list vs detail)
  reward?:
    | { rewardTypeId?: number; value?: number | null }   // list style
    | { rewardTypeId?: number; rewardTypeName?: string; rewardValue?: number | null } // detail style
    | null;

  // data requirements
  dataCoverageDaysRequired?: number | null;

  // metrics (three shapes across list/detail)
  metrics?:
    | number[]                                                    // list: [101, 110]
    | { id: number; name: string }[]                              // list/style A
    | { metricId: number; displayName: string | null }[];         // detail/style B
  metricIds?: number[];                                           // some list items use this instead

  // eligibility (two shapes)
  minAge?: number | null;
  maxAge?: number | null;

  healthConditionIds?: number[];
  healthConditions?:
    | { id: number; name: string }[]                              // list/style A
    | { healthConditionId: number; displayName: string | null }[];// detail/style B

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

// Page wrapper used by the list endpoint.
export type PostingsPageDTO = {
  page: number;
  pageSize: number;
  hasNext: boolean;
  items: PostingDTO[];
};

// Convenience union for code paths where the API might return a page wrapper
// (list) or a single object (detail).
export type PostingsResponse = PostingsPageDTO | PostingDTO;
