// src/services/opportunities/mapper.ts
import type { PostingDTO } from "./dto";
import type { Opportunity } from "./types";

export function mapPostingToOpportunity(
  p: PostingDTO,
  level: "list" | "full" = "list"
): Opportunity {
  // --- reward normalization (list vs detail) ---
  const rewardAny = p.reward as any;
  const rewardValue =
    rewardAny?.value ?? rewardAny?.rewardValue ?? null; // number | null
  const rewardTypeId =
    rewardAny?.rewardTypeId ?? null;                    // number | null
    const rewardTypeName =
  rewardAny?.rewardTypeName ?? null;

  // --- metrics normalization (three shapes: number[], {id,name}[], {metricId,displayName}[]) ---
  let metricsNamed: { id: number; name: string }[] | undefined;
  let metricIdsFromMetrics: number[] | undefined;

  if (Array.isArray(p.metrics) && p.metrics.length > 0) {
    const first = p.metrics[0] as any;

    if (typeof first === "number") {
      // e.g. [101, 110]
      metricIdsFromMetrics = p.metrics as number[];
    } else if (first && typeof first === "object") {
      if ("id" in first) {
        // e.g. [{ id, name }]
        metricsNamed = (p.metrics as any[]).map((m) => ({
          id: Number(m.id),
          name: String(m.name),
        }));
      } else if ("metricId" in first) {
        // e.g. [{ metricId, displayName }]
        metricsNamed = (p.metrics as any[]).map((m) => ({
          id: Number(m.metricId),
          name: m.displayName ?? String(m.metricId),
        }));
      }
    }
  }

  // --- health conditions normalization (two shapes) ---
  let healthNamed: { id: number; name: string }[] | undefined;
  if (Array.isArray(p.healthConditions) && p.healthConditions.length > 0) {
    const first = p.healthConditions[0] as any;
    if (first && typeof first === "object") {
      if ("id" in first) {
        // [{ id, name }]
        healthNamed = (p.healthConditions as any[]).map((h) => ({
          id: Number(h.id),
          name: String(h.name),
        }));
      } else if ("healthConditionId" in first) {
        // [{ healthConditionId, displayName }]
        healthNamed = (p.healthConditions as any[]).map((h) => ({
          id: Number(h.healthConditionId),
          name: h.displayName ?? String(h.healthConditionId),
        }));
      }
    }
  }

  // --- description preference ---
  const description =
    level === "full"
      ? (p.description ?? p.summary ?? null)
      : (p.summary ?? null);

  // --- sponsor preference (detail may send buyerName) ---
  const sponsor = p.buyer?.displayName ?? p.buyerName ?? null;

  return {
    id: String(p.postingId),
    title: p.title,
    description,
    imageUrl: p.imageUrl ?? null,
    sponsor,

    reward:
      rewardValue != null || rewardTypeId != null
        ? { credits: rewardValue ?? undefined, typeId: rewardTypeId ?? undefined ,  typeName: rewardTypeName ?? undefined,}
        : undefined,

    createdAt: p.createdOn ?? null,
    applyOpenAt: p.applyOpenAt ?? null,
    applyCloseAt: p.applyCloseAt ?? null,
    daysRemaining: p.daysRemaining ?? null,

    dataCoverageDaysRequired: p.dataCoverageDaysRequired ?? null,

    // prefer explicit metricIds, else derive from number[] variant
    metricIds: p.metricIds ?? metricIdsFromMetrics ?? [],
    metrics: metricsNamed,

    minAge: p.minAge ?? null,
    maxAge: p.maxAge ?? null,
    healthConditionIds: p.healthConditionIds ?? [],
    healthConditions: healthNamed,

    viewPolicyIds: p.viewPolicyIds ?? [],
    viewPolicies: p.viewPolicies
      ? p.viewPolicies.map((v) => ({ id: Number(v.id), name: String(v.name) }))
      : undefined,

    tags: p.tags ?? [],

    applyUrl: (p as any).applyUrl ?? null,
    privacyUrl: (p as any).privacyUrl ?? null,
    termsUrl: (p as any).termsUrl ?? null,

    detailLevel: level,
  };
}
