// app/opportunities/[id].tsx
import Button from "@/src/components/ui/Button";
import Chip from "@/src/components/ui/Chip";
import { testFlags } from "@/src/config/featureFlags";
import { useCurrentUserId } from "@/src/hooks/useCurrentUserId";
import { getSessionByPosting } from "@/src/services/sharing/api";
import { getShareRuntimeConfig } from "@/src/services/sharing/constants";
import {
  checkMetricDataLast24Hours,
  checkMetricPermissionsForMap,
  type MetricCode,
} from "@/src/services/sharing/summarizer";
import { useMarketStore as useMarketplaceStore } from "@/src/store/useMarketStore";
import {
  computeNextWindowFromSnapshot,
  formatTimeLeftLabel,
  useShareStore,
} from "@/src/store/useShareStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Linking, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useApplyGateStore } from "@/src/store/useApplyGateStore";

// --- tiny helpers (local to this file to keep it self-contained) ---
const hasAny = (arr?: Array<any>) => Array.isArray(arr) && arr.length > 0;
const hasText = (s?: string | null) => !!(s && s.trim().length > 0);
const formatAgeRange = (min?: number | null, max?: number | null) => {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `≤${max}`;
  return null;
};

// Match onboarding labels (so missing fields look human)
const PROFILE_FIELD_LABELS: Record<string, string> = {
  BirthYear: "Birth year",
  RaceId: "Race",
  SexId: "Sex",
  HeightNum: "Height",
  HeightUnitId: "Height unit",
  WeightNum: "Weight",
  WeightUnitId: "Weight unit",
  MeasurementSystemId: "Measurement system",
};

function humanizeMissingFields(raw: unknown) {
  const arr = Array.isArray(raw) ? raw : [];
  const mapped = arr
    .map((k) => PROFILE_FIELD_LABELS[String(k)] ?? null)
    .filter((x): x is string => !!x);

  // De-dupe + hide unknown backend keys
  return Array.from(new Set(mapped));
}

type AnyMetricRow = {
  id?: number;
  metricId?: number;
  code?: string;
  displayName?: string;
  name?: string;
};

type SupportedCode = MetricCode;
const SUPPORTED: Record<MetricCode, true> = {
  STEPS: true,
  FLOORS: true,
  DISTANCE: true,
  KCAL: true,
  HR: true,
  SLEEP: true,
};

const labelOfMetric = (m: string) => {
  switch (m) {
    case "STEPS":
      return "Steps";
    case "FLOORS":
      return "Floors";
    case "DISTANCE":
      return "Distance";
    case "KCAL":
      return "Active Calories";
    case "HR":
      return "Heart Rate";
    case "SLEEP":
      return "Sleep";
    default:
      return String(m);
  }
};

function showNoRecentDataAlert(missing: MetricCode[]) {
  const labels = missing.map(labelOfMetric).join(", ");
  Alert.alert(
    "No recent data found",
    `We couldn’t find any data in the last 24 hours for:\n• ${labels}\n\n` +
      `To apply, please make sure these metrics are being recorded on your device, then try again.`,
  );
}

function showMissingPermissionsAlert(missing: MetricCode[]) {
  const labels = missing.map(labelOfMetric).join(", ");
  Alert.alert(
    "Permissions needed",
    `To apply, please allow access to:\n• ${labels}\n\nThen try again.`,
  );
}

// Normalize names → MetricCode
function normalizeMetricCode(raw?: string | null): MetricCode | undefined {
  if (!raw) return;
  const s = String(raw).trim().toUpperCase();

  if ((SUPPORTED as any)[s]) return s as MetricCode;

  if (s.includes("STEP")) return "STEPS";
  if (s.includes("FLOOR")) return "FLOORS";
  if (s.includes("DISTANCE")) return "DISTANCE";
  if (s.includes("KCAL") || s.includes("CALOR") || s.includes("ACTIVE ENERGY"))
    return "KCAL";
  if (s === "HR" || s.includes("HEART RATE")) return "HR";
  if (s.includes("SLEEP")) return "SLEEP";
  return;
}

// Build a map of SupportedCode → metricId from the posting object (no hard-coding of IDs)
function buildMetricMapStrict(
  posting: any,
  metricCatalog?: Array<{ metricId: number; code: string }>,
): Partial<Record<MetricCode, number>> {
  const out: Partial<Record<MetricCode, number>> = {};

  const metricsArr: AnyMetricRow[] = Array.isArray(posting?.metrics)
    ? (posting.metrics as AnyMetricRow[])
    : [];

  if (__DEV__) console.log("[OppDetails] posting.metrics =", metricsArr);

  for (const m of metricsArr) {
    const code =
      normalizeMetricCode(m.code) ??
      normalizeMetricCode(m.displayName) ??
      normalizeMetricCode(m.name);
    const id = m.metricId ?? m.id;
    if (id != null && code && SUPPORTED[code]) {
      out[code] = id;
    }
  }

  const metricIdsArr: number[] = Array.isArray(posting?.metricIds)
    ? (posting.metricIds as number[])
    : [];

  if (__DEV__) console.log("[OppDetails] posting.metricIds =", metricIdsArr);

  if (
    metricIdsArr.length > 0 &&
    Array.isArray(metricCatalog) &&
    metricCatalog.length > 0
  ) {
    const idSet = new Set<number>(metricIdsArr);
    if (__DEV__)
      console.log("[OppDetails] metricCatalog size =", metricCatalog.length);
    for (const row of metricCatalog) {
      const code = normalizeMetricCode(row.code);
      if (code && idSet.has(row.metricId) && SUPPORTED[code]) {
        out[code] = row.metricId;
      }
    }
  } else if (
    metricIdsArr.length > 0 &&
    (!metricCatalog || metricCatalog.length === 0)
  ) {
    if (__DEV__) {
      console.log(
        "[OppDetails] metricIds present but no catalog provided — cannot resolve codes from IDs yet",
      );
    }
  }

  if (__DEV__) console.log("[OppDetails] buildMetricMapStrict →", out);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW: fixed 24h helpers for preview/backdating (Test Mode rule)
// ─────────────────────────────────────────────────────────────────────────────
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fmtUTC(iso: string) {
  return new Date(iso).toISOString().replace(".000Z", "Z");
}

function fmtLocal(iso: string) {
  // 24h local for clarity in QA; shows date + time
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtMonthDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
  });
}

function computeMissedCatchUp(
  snap: {
    cycleAnchorUtc: string;
    segmentsExpected: number;
    lastSentDayIndex: number | null;
  },
  nowMs: number,
  dayMs: number,
  graceMs: number,
): {
  missedCount: number;
  nextMissedDayIndex: number | null;
  nextFromUtc: string | null;
} {
  const anchorMs = Date.parse(snap.cycleAnchorUtc);
  if (!Number.isFinite(anchorMs)) {
    return { missedCount: 0, nextMissedDayIndex: null, nextFromUtc: null };
  }

  const expected = Number(snap.segmentsExpected ?? 0);
  const lastSent =
    snap.lastSentDayIndex == null ? 0 : Number(snap.lastSentDayIndex);

  let missedCount = 0;
  let nextMissedDayIndex: number | null = null;
  let nextFromUtc: string | null = null;

  for (let dayIdx = Math.max(1, lastSent + 1); dayIdx <= expected; dayIdx++) {
    const toMs = anchorMs + dayIdx * dayMs;
    const fromMs = toMs - dayMs;
    const dueAtMs = toMs + graceMs;

    if (nowMs >= dueAtMs) {
      missedCount += 1;
      if (nextMissedDayIndex == null) {
        nextMissedDayIndex = dayIdx;
        nextFromUtc = new Date(fromMs).toISOString();
      }
    }
  }

  return { missedCount, nextMissedDayIndex, nextFromUtc };
}

// === [SECTION_HEADER_COMPONENT] reusable title + subtitle
function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const c = useThemeColors();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "700" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: c.text.secondary, fontSize: 13 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export default function OpportunityDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useThemeColors();
  const startSession = useShareStore((s) => s.startSession);
  const status = useShareStore((s) => s.status);
  const segmentsExpected = useShareStore((s) => s.segmentsExpected);
  const enterSimulation = useShareStore((s) => s.enterSimulation);
  const simulateNextDay = useShareStore((s) => s.simulateNextDay);
  const exitSimulation = useShareStore((s) => s.exitSimulation);
  const mode = useShareStore((s) => s.engine.mode);
  const cycleAnchorUtc = useShareStore((s) => s.cycleAnchorUtc);
  const originalCycleAnchorUtc = useShareStore((s) => s.originalCycleAnchorUtc);
  const engine = useShareStore((s) => s.engine);
  const tick = useShareStore((s) => s.tick);
  const catchUpIfNeeded = useShareStore((s) => s.catchUpIfNeeded);
  const catchUpNextOne = useShareStore((s) => s.catchUpNextOne);
  const sessionId = useShareStore((s) => s.sessionId);
  const isProcessing = engine?.currentDueDayIndex != null;
  const completed = (engine?.segmentsSent ?? 0) >= (segmentsExpected ?? 0);
  const userId = useCurrentUserId();
  const ensureCanApply = useApplyGateStore((s) => s.ensureCanApply);
  const { getByIdSafe, savedIds, toggleSave, loadById, loading } =
    useMarketplaceStore();
  const lastDiag = useShareStore((s) => s.lastWindowDiag);
  const snapshot = useShareStore((s) => s.snapshot);
  const fetchSessionSnapshot = useShareStore((s) => s.fetchSessionSnapshot);

  const cached = useMemo(
    () => (id ? getByIdSafe(String(id)) : undefined),
    [getByIdSafe, id],
  );
  const [item, setItem] = useState(cached);
  const [sessionLookup, setSessionLookup] = useState<null | {
    sessionId: number;
    statusName?: string | null;
    source?: "ACTIVE" | "LATEST";
  }>(null);
  const [sessionLookupLoading, setSessionLookupLoading] = useState(false);
  function sameLookup(a: typeof sessionLookup, b: typeof sessionLookup) {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.sessionId === b.sessionId &&
      a.statusName === b.statusName &&
      a.source === b.source
    );
  }

  // Keep last selected pieces of the share store to detect meaningful changes
  const shareSnapRef = useRef<{
    status: string;
    sent: number;
    due: number | null;
  }>({
    status: String(useShareStore.getState().status ?? ""),
    sent: Number(useShareStore.getState().engine?.segmentsSent ?? 0),
    due: (useShareStore.getState().engine?.currentDueDayIndex ?? null) as
      | number
      | null,
  });

  const refreshSessionLookup = useCallback(async () => {
    if (!item || userId == null) return;
    const postingId = Number((item as any).postingId ?? (item as any).id);
    setSessionLookupLoading(true);
    try {
      const res = await getSessionByPosting(postingId, userId).catch(
        () => null,
      );
      if (res) {
        const next = {
          sessionId: res.sessionId,
          statusName: res.statusName,
          source: res.source as "ACTIVE" | "LATEST",
        };
        setSessionLookup((prev) => (sameLookup(prev, next) ? prev : next));
      } else {
        setSessionLookup((prev) => (prev === null ? prev : null));
      }
    } finally {
      setSessionLookupLoading(false);
    }
  }, [item, userId]);

  useEffect(() => {
    if (item && userId != null) refreshSessionLookup();
  }, [item, userId, refreshSessionLookup]);

  useEffect(() => {
    if (!item || userId == null) return;
    const postingId = Number((item as any).postingId ?? (item as any).id);
    if (!postingId) return;
    fetchSessionSnapshot(userId, postingId);
  }, [item, userId, fetchSessionSnapshot]);

  const [nowTick, setNowTick] = useState(Date.now());

  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => setNowTick(Date.now()), 60_000);
      return () => clearInterval(id as unknown as number);
    }, []),
  );

  // Keep UI in sync: refresh on screen focus and when share engine progresses
  useFocusEffect(
    useCallback(() => {
      // Refresh when the screen gains focus
      refreshSessionLookup();

      // Also refresh backend snapshot on focus (server-clock truth)
      (async () => {
        const postingId = Number((item as any)?.postingId ?? (item as any)?.id);
        if (userId != null && postingId) {
          await useShareStore
            .getState()
            .fetchSessionSnapshot(userId, postingId);
        }
      })();

      // Sync the snapshot before listening
      shareSnapRef.current = {
        status: String(useShareStore.getState().status ?? ""),
        sent: Number(useShareStore.getState().engine?.segmentsSent ?? 0),
        due: (useShareStore.getState().engine?.currentDueDayIndex ?? null) as
          | number
          | null,
      };

      // Subscribe to the whole store; do our own selection+diff
      const unsubscribe = useShareStore.subscribe((s) => {
        const next = {
          status: String(s.status ?? ""),
          sent: Number(s.engine?.segmentsSent ?? 0),
          due: (s.engine?.currentDueDayIndex ?? null) as number | null,
        };
        const prev = shareSnapRef.current;

        if (
          next.status !== prev.status ||
          next.sent !== prev.sent ||
          next.due !== prev.due
        ) {
          // update snapshot *first* to avoid duplicate refreshes
          shareSnapRef.current = next;
          refreshSessionLookup();
          const postingId = Number(
            (item as any)?.postingId ?? (item as any)?.id,
          );
          if (userId != null && postingId) {
            void useShareStore
              .getState()
              .fetchSessionSnapshot(userId, postingId);
          }
        }
      });

      return () => unsubscribe();
    }, [refreshSessionLookup, item, userId]),
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!item || userId == null) return;
        const postingId = Number((item as any).postingId ?? (item as any).id);
        setSessionLookupLoading(true);
        const res = await getSessionByPosting(postingId, userId).catch(
          () => null,
        );
        if (!mounted) return;
        if (res) {
          const next = {
            sessionId: res.sessionId,
            statusName: res.statusName,
            source: res.source as "ACTIVE" | "LATEST",
          };
          setSessionLookup((prev) => (sameLookup(prev, next) ? prev : next));
        } else {
          setSessionLookup((prev) => (prev === null ? prev : null));
        }
      } finally {
        if (mounted) setSessionLookupLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [item, userId]);

  useEffect(() => {
    let mounted = true;
    if (!id) return;

    if (__DEV__) console.log("[OpportunityDetails] id param =", id);

    (async () => {
      try {
        const forceFn = loadById as unknown as (
          a: string,
          b?: { force?: boolean },
        ) => any;
        const fetched = await forceFn(String(id), { force: true }).catch(
          async () => {
            const legacyFn = loadById as unknown as (a: string) => any;
            return legacyFn(String(id));
          },
        );
        // always prefer fresh fetched data, even if the same id
        if (mounted && fetched) {
          setItem(fetched);
        } else if (__DEV__ && mounted && !fetched && cached) {
          console.log("[OpportunityDetails] using cached list-level item");
        }
      } catch (e) {
        if (__DEV__) console.warn("[OpportunityDetails] fetch error:", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, loadById]);

  useEffect(() => {
    if (__DEV__) console.log("[OppDetails] item (cached or fetched) =", item);
  }, [item]);

  // keep the ORIGINAL join anchor for consistent backdating
  const originalAnchorRef = useRef<string | null>(null);
  useEffect(() => {
    if (cycleAnchorUtc && !originalAnchorRef.current) {
      originalAnchorRef.current = cycleAnchorUtc;
      if (__DEV__)
        console.log("[OppDetails][TEST] original anchor set =", cycleAnchorUtc);
    }
  }, [cycleAnchorUtc]);

  // const handleApply = useCallback(async () => {
  //   if (!item) return;
  //   if (userId == null) {
  //     Alert.alert(
  //       "Sign in required",
  //       "Please sign in to apply and start sharing."
  //     );
  //     return;
  //   }

  //   const metricMap = buildMetricMapStrict(item) as Partial<
  //     Record<MetricCode, number>
  //   >;
  //   const codes = Object.keys(metricMap) as MetricCode[];
  //   if (codes.length === 0) {
  //     console.log("[OppDetails] No resolvable metrics for posting", { item });
  //     Alert.alert(
  //       "Unsupported",
  //       "This posting’s metrics cannot be resolved yet. Please try again later."
  //     );
  //     return;
  //   }

  //   const days = Number(item.dataCoverageDaysRequired ?? 5);
  //   const simNote = __DEV__
  //     ? "\n\n(DEV mode: “days” advance quickly for testing)"
  //     : "";

  //   Alert.alert(
  //     "Share your data?",
  //     `We’ll collect and share the requested metrics for ${days} day${days === 1 ? "" : "s"}.${simNote}`,
  //     [
  //       { text: "Cancel", style: "cancel" },
  //       {
  //         text: "OK",
  //         onPress: async () => {
  //           try {
  //             const postingId = Number(
  //               (item as any).postingId ?? (item as any).id
  //             );

  //             // Build map once
  //             const metricMap = buildMetricMapStrict(item) as Partial<
  //               Record<MetricCode, number>
  //             >;

  //             // iOS: attempt targeted permission resolution before starting
  //             let remainingMissing: MetricCode[] = [];
  //             if (Platform.OS === "ios") {
  //               remainingMissing =
  //                 await iosResolveHealthPermissionsBeforeStart(metricMap);
  //             }

  //             // Cross-platform final check (keeps Android logic identical)
  //             const probe = await checkMetricPermissionsForMap(
  //               metricMap as Record<MetricCode, number>
  //             );
  //             const reallyMissing = Array.from(
  //               new Set([...(probe.missing ?? []), ...remainingMissing])
  //             );

  //             if (reallyMissing.length > 0) {
  //               const missingLabels = reallyMissing
  //                 .map(labelOfMetric)
  //                 .join(", ");
  //               const msg =
  //                 `We don’t have permission for:\n• ${missingLabels}\n\n` +
  //                 `You can still start sharing; those metrics will be reported as unavailable until you grant access.`;
  //               const cont = await new Promise<boolean>((resolve) => {
  //                 Alert.alert("Missing permissions", msg, [
  //                   {
  //                     text: "Cancel",
  //                     style: "cancel",
  //                     onPress: () => resolve(false),
  //                   },
  //                   { text: "Start anyway", onPress: () => resolve(true) },
  //                 ]);
  //               });
  //               if (!cont) return;
  //             }

  //             await startSession(
  //               postingId,
  //               userId!,
  //               metricMap,
  //               Number(item.dataCoverageDaysRequired ?? 5)
  //             );
  //             setSessionLookup((prev) => ({
  //               sessionId: prev?.sessionId ?? 0,
  //               statusName: "ACTIVE",
  //               source: "ACTIVE",
  //             }));
  //             refreshSessionLookup();
  //             const pid = Number((item as any).postingId ?? (item as any).id);
  //             if (userId != null && pid) {
  //               void useShareStore.getState().fetchSessionSnapshot(userId, pid);
  //             }
  //             Alert.alert(
  //               "Sharing started",
  //               __DEV__
  //                 ? "First segment will send now.\nDay progression is accelerated for testing."
  //                 : "We’ll send your first segment now and continue every 24 hours."
  //             );
  //           } catch (e) {
  //             console.log("[OppDetails] startSession error", e);
  //             Alert.alert(
  //               "Error",
  //               "Failed to start sharing. Please try again."
  //             );
  //           }
  //         },
  //       },
  //     ]
  //   );
  // }, [item, startSession, userId, refreshSessionLookup]);

  const handleApply = useCallback(async () => {
    if (!item) return;
    if (userId == null) {
      Alert.alert(
        "Sign in required",
        "Please sign in to apply and start sharing.",
      );
      return;
    }

    // Apply gate: ensure profile is complete before applying
    const gate = await ensureCanApply(userId);

    if (!gate.ok) {
      // Case A: profile truly incomplete → route to onboarding
      if (gate.needsProfile) {
        const missingPretty = humanizeMissingFields(gate.missingProfileFields);
        const missing =
          missingPretty.length > 0
            ? `\n\nMissing: ${missingPretty.join(", ")}`
            : "";

        Alert.alert(
          "Complete your profile",
          `Please complete your profile before applying.${missing}`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Go to profile",
              onPress: () => router.push("/(app)/onboarding/profile"),
            },
          ],
        );
        return;
      }

      // Case B: backend error/unreachable or other non-profile block → do NOT route
      Alert.alert(
        "Unable to verify profile",
        gate.error ??
          "We couldn't verify your profile right now. Please try again.",
      );
      return;
    }

    const metricMap = buildMetricMapStrict(item) as Partial<
      Record<MetricCode, number>
    >;
    const codes = Object.keys(metricMap) as MetricCode[];
    if (codes.length === 0) {
      console.log("[OppDetails] No resolvable metrics for posting", { item });
      Alert.alert(
        "Unsupported",
        "This posting’s metrics cannot be resolved yet. Please try again later.",
      );
      return;
    }

    const days = Number(item.dataCoverageDaysRequired ?? 5);
    const simNote = __DEV__
      ? "\n\n(DEV mode: “days” advance quickly for testing)"
      : "";

    Alert.alert(
      "Share your data?",
      `We’ll collect and share the requested metrics for ${days} day${days === 1 ? "" : "s"}.${simNote}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK",
          onPress: async () => {
            try {
              const postingId = Number(
                (item as any).postingId ?? (item as any).id,
              );

              // Build map once for the session
              const metricMap = buildMetricMapStrict(item) as Partial<
                Record<MetricCode, number>
              >;

              // Cross-platform readability probe (permissions / provider / data)
              const probe = await checkMetricPermissionsForMap(
                metricMap as Record<MetricCode, number>,
              );
              const missing = probe.missing ?? [];

              // if (missing.length > 0) {
              //   const missingLabels = missing.map(labelOfMetric).join(", ");
              //   const msg =
              //     `Right now we cannot read data for:\n• ${missingLabels}\n\n` +
              //     `This can happen if Health permissions are disabled or there is no data yet for those metrics.\n\n` +
              //     `You can still start sharing; those metrics will be reported as unavailable until data becomes readable.`;
              //   const cont = await new Promise<boolean>((resolve) => {
              //     Alert.alert("Some metrics unavailable", msg, [
              //       {
              //         text: "Cancel",
              //         style: "cancel",
              //         onPress: () => resolve(false),
              //       },
              //       { text: "Start anyway", onPress: () => resolve(true) },
              //     ]);
              //   });
              //   if (!cont) return;
              // }

              if (missing.length > 0) {
                showMissingPermissionsAlert(missing);
                return;
              }

              // NEW: strict eligibility gate — require data in the last 24 hours
              const dataProbe = await checkMetricDataLast24Hours(codes);
              if (!dataProbe.ok) {
                if (__DEV__) {
                  console.log("[OppDetails] 24h data gate failed", dataProbe);
                }
                showNoRecentDataAlert(dataProbe.missingData);
                return;
              }

              await startSession(
                postingId,
                userId!,
                metricMap,
                Number(item.dataCoverageDaysRequired ?? 5),
              );
              setSessionLookup((prev) => ({
                sessionId: prev?.sessionId ?? 0,
                statusName: "ACTIVE",
                source: "ACTIVE",
              }));
              refreshSessionLookup();
              const pid = Number((item as any).postingId ?? (item as any).id);
              if (userId != null && pid) {
                void useShareStore.getState().fetchSessionSnapshot(userId, pid);
              }
              Alert.alert(
                "Sharing started",
                __DEV__
                  ? "First segment will send now.\nDay progression is accelerated for testing."
                  : "We’ll send your first segment now and continue every 24 hours.",
              );
            } catch (e) {
              console.log("[OppDetails] startSession error", e);
              Alert.alert(
                "Error",
                "Failed to start sharing. Please try again.",
              );
            }
          },
        },
      ],
    );
  }, [
    item,
    startSession,
    userId,
    ensureCanApply,
    router,
    refreshSessionLookup,
  ]);

  if (!item) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: c.bg }}
        edges={["top", "left", "right", "bottom"]}
      >
        <ScrollView
          style={{ backgroundColor: c.bg }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{ color: c.text.primary, fontSize: 20, fontWeight: "800" }}
          >
            {loading ? "Loading…" : "Opportunity not found"}
          </Text>
          {!loading && (
            <>
              <Text style={{ color: c.text.secondary, marginTop: 8 }}>
                The opportunity you’re looking for isn’t available.
              </Text>
              <View style={{ marginTop: 16 }}>
                <Button
                  title="Back"
                  onPress={() => router.back()}
                  variant="secondary"
                />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const saved = savedIds?.includes(item.id);

  const apiStatusUpper = (sessionLookup?.statusName || "").toUpperCase();

  const organizerLabel =
    (hasText(item?.sponsor) ? String(item.sponsor).trim() : null) ??
    "the study team";

  const coverageDays = Number(item?.dataCoverageDaysRequired ?? 5);

  const applyDisclosureLine =
    `By applying, you agree to share the requested health metrics for ${coverageDays} day` +
    `${coverageDays === 1 ? "" : "s"} with ${organizerLabel}. ` +
    `Your data is shared in de-identified form and is not labeled with your name or direct personal identifiers.`;

  const { applyTitle, applyDisabled } = useMemo(() => {
    if (userId == null)
      return { applyTitle: "Sign in to apply", applyDisabled: true };
    if (sessionLookupLoading)
      return { applyTitle: "Checking…", applyDisabled: true };
    if (apiStatusUpper === "ACTIVE")
      return { applyTitle: "Already sharing", applyDisabled: true };
    if (apiStatusUpper === "COMPLETED")
      return { applyTitle: "Completed", applyDisabled: true };
    if (apiStatusUpper === "CANCELLED")
      return { applyTitle: "Apply", applyDisabled: false };
    return { applyTitle: "Apply", applyDisabled: false };
  }, [userId, sessionLookupLoading, apiStatusUpper]);

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW: Sim helpers (use ORIGINAL anchor; always 24h blocks)
  // nextTargetIdx = next unsent day (1..segmentsExpected)
  const nextTargetIdx = Math.min(
    Math.max(1, (engine?.lastSentDayIndex ?? 0) + 1),
    Number(segmentsExpected ?? 0) || 0,
  );

  const nextWindowPreview = (() => {
    const baseIso = originalCycleAnchorUtc ?? cycleAnchorUtc;
    if (
      !testFlags.TEST_MODE ||
      !sessionId ||
      status !== "ACTIVE" ||
      !baseIso ||
      nextTargetIdx <= 0 ||
      completed
    ) {
      return null;
    }
    const t0 = Date.parse(baseIso);
    const fromUtc = new Date(t0 - nextTargetIdx * ONE_DAY_MS).toISOString();
    const toUtc = new Date(t0 - (nextTargetIdx - 1) * ONE_DAY_MS).toISOString();
    return {
      idx: nextTargetIdx,
      fromUtc,
      toUtc,
      fromLocal: fmtLocal(fromUtc),
      toLocal: fmtLocal(toUtc),
    };
  })();

  // const backdateToDayIndexAndTick = useCallback((targetDayIdx: number) => {
  //   if (!testFlags.TEST_MODE) return;
  //   const baseIso = originalAnchorRef.current ?? cycleAnchorUtc;
  //   if (!baseIso) {
  //     if (__DEV__) console.log('[OppDetails][TEST] No anchor yet.');
  //     return;
  //   }
  //   const newIso = new Date(Date.parse(baseIso) - targetDayIdx * ONE_DAY_MS).toISOString();
  //   if (__DEV__) console.log('[OppDetails][TEST] backdate', { targetDayIdx, baseIso, newIso });
  //   setBackdatedAnchorTestOnly(newIso);
  //   // process immediately; store will handle grace/retries if needed
  //   tick();
  // }, [cycleAnchorUtc, setBackdatedAnchorTestOnly, tick]);

  // const simNextDay = useCallback(() => {
  //   if (!segmentsExpected) return;
  //   if ((engine?.lastSentDayIndex ?? 0) >= segmentsExpected) return;
  //   backdateToDayIndexAndTick(nextTargetIdx);
  // }, [segmentsExpected, engine?.lastSentDayIndex, nextTargetIdx, backdateToDayIndexAndTick]);

  // const simAllRemaining = useCallback(() => {
  //   if (!segmentsExpected) return;
  //   // Backdate to N so all windows 1..N are in the past, then let catch-up sweep them.
  //   const baseIso = originalAnchorRef.current ?? cycleAnchorUtc;
  //   if (!baseIso) return;
  //   const n = Number(segmentsExpected);
  //   const newIso = new Date(Date.parse(baseIso) - n * ONE_DAY_MS).toISOString();
  //   if (__DEV__) console.log('[OppDetails][TEST] backdate ALL', { n, baseIso, newIso });
  //   setBackdatedAnchorTestOnly(newIso);
  //   // Sweep all past windows in order
  //   catchUpIfNeeded();
  // }, [segmentsExpected, cycleAnchorUtc, setBackdatedAnchorTestOnly, catchUpIfNeeded]);

  const simNextDay = useCallback(async () => {
    if (!testFlags.TEST_MODE) return;
    if (!segmentsExpected) return;
    if ((engine?.lastSentDayIndex ?? 0) >= segmentsExpected) return;
    if (completed) return;
    if (mode !== "SIM") enterSimulation();
    await simulateNextDay();
  }, [
    segmentsExpected,
    engine?.lastSentDayIndex,
    simulateNextDay,
    enterSimulation,
    mode,
  ]);

  const doCatchUpOne = useCallback(async () => {
    try {
      await catchUpNextOne();
    } catch (e) {
      if (__DEV__) console.warn("[OppDetails] catch-up error", e);
    }
  }, [catchUpNextOne]);

  const simAllRemaining = useCallback(async () => {
    if (!testFlags.TEST_MODE) return;
    if (!segmentsExpected) return;
    if (completed) return;
    if (mode !== "SIM") enterSimulation();
    for (;;) {
      const s = useShareStore.getState();
      if (s.status !== "ACTIVE") break;
      const sent = s.engine?.segmentsSent ?? 0;
      const expected = s.segmentsExpected ?? 0;
      if (sent >= expected) break;
      await s.simulateNextDay();
      await Promise.resolve(); // let UI breathe
    }
  }, [segmentsExpected, enterSimulation, mode]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title + Sponsor */}
        <View style={{ gap: 6 }}>
          <Text
            style={{ color: c.text.primary, fontSize: 22, fontWeight: "800" }}
          >
            {item.title}
          </Text>
          {item.sponsor ? (
            <Text style={{ color: c.text.secondary }}>{item.sponsor}</Text>
          ) : null}
        </View>

        {/* Quick facts */}
        <View
          style={{
            backgroundColor: c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            gap: 8,
          }}
        >
          <SectionHeader
            title="At a glance"
            subtitle="Key information for a quick review."
          />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {typeof item.reward?.credits === "number" ? (
              <Chip label={`Reward total: +${item.reward.credits}`} />
            ) : null}
            {item.createdAt ? (
              <Chip
                label={`Posted: ${new Date(item.createdAt).toLocaleDateString()}`}
              />
            ) : null}
            {item.applyOpenAt && item.applyCloseAt ? (
              <Chip
                label={`Apply window: ${new Date(item.applyOpenAt).toLocaleDateString()} → ${new Date(
                  item.applyCloseAt,
                ).toLocaleDateString()}`}
              />
            ) : null}
            {typeof item.daysRemaining === "number" ? (
              <Chip label={`Days left to apply: ${item.daysRemaining}`} />
            ) : null}
            {typeof item.dataCoverageDaysRequired === "number" ? (
              <Chip
                label={`Sharing duration: ${item.dataCoverageDaysRequired} days`}
              />
            ) : null}
            {(item as any).postingStatusCode ? (
              <Chip
                label={`Study status: ${(item as any).postingStatusCode}`}
              />
            ) : null}
            {item.reward?.typeName ? (
              <Chip label={item.reward.typeName} />
            ) : null}
            {apiStatusUpper === "ACTIVE" ? (
              <Chip label="Sharing status: Active" />
            ) : null}
            {apiStatusUpper === "COMPLETED" ? (
              <Chip label="Sharing status: Completed" />
            ) : null}
            {apiStatusUpper === "CANCELLED" ? (
              <Chip label="Sharing status: Cancelled" />
            ) : null}
          </View>
        </View>

        {/* Overview */}
        {hasText(item.description) && (
          // === [SECTION_ABOUT]
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <SectionHeader
              title="About this opportunity"
              subtitle="Purpose and overview provided by the organizer."
            />
            <Text style={{ color: c.text.secondary }}>{item.description}</Text>
          </View>
        )}

        {/* Requested Data */}
        {(() => {
          const metricsArr: AnyMetricRow[] = Array.isArray(item?.metrics)
            ? (item.metrics as AnyMetricRow[])
            : [];
          const metricIdsArr: number[] = Array.isArray(item?.metricIds)
            ? (item.metricIds as number[])
            : [];

          if (__DEV__) {
            console.log("[OppDetails][UI] metricsArr=", metricsArr);
            console.log("[OppDetails][UI] metricIdsArr=", metricIdsArr);
          }

          if (metricsArr.length === 0 && metricIdsArr.length === 0) return null;

          const deduped: Array<{ id: number; label: string; idx: number }> = [];
          const seen = new Set<string>();
          metricsArr.forEach((m, idx) => {
            const id = (m.id ?? m.metricId ?? idx) as number;
            const label = String(
              m.displayName ??
                m.name ??
                m.code ??
                m.id ??
                m.metricId ??
                "metric",
            ); // ← force to string
            const sig = `${id}|${label}`;
            if (!seen.has(sig)) {
              seen.add(sig);
              deduped.push({ id, label, idx });
            }
          });

          return (
            <View
              style={{
                backgroundColor: c.surface,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
                gap: 8,
              }}
            >
              <SectionHeader
                title="Data requested for sharing"
                subtitle="Health metrics the organizer asks you to share."
              />

              {deduped.length > 0 ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {deduped.map(({ id, label, idx }) => (
                    <Chip key={`met-${id}-${idx}`} label={label} />
                  ))}
                </View>
              ) : (
                <Text style={{ color: c.text.secondary }}>
                  Metrics: {metricIdsArr.length ? metricIdsArr.join(", ") : "—"}
                </Text>
              )}
            </View>
          );
        })()}

        {/* Eligibility */}
        {(item.minAge != null ||
          item.maxAge != null ||
          hasAny(item.healthConditions) ||
          hasAny(item.healthConditionIds)) && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <SectionHeader
              title="Who can participate"
              subtitle="Participation criteria such as age range and health conditions."
            />
            {formatAgeRange(item.minAge, item.maxAge) ? (
              <Text style={{ color: c.text.secondary }}>
                Age range: {formatAgeRange(item.minAge, item.maxAge)}
              </Text>
            ) : null}

            {hasAny(item.healthConditions) ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.healthConditions!.map((h) => (
                  <Chip key={`hc-${h.id}`} label={h.name} />
                ))}
              </View>
            ) : hasAny(item.healthConditionIds) ? (
              <Text style={{ color: c.text.secondary }}>
                Health conditions: {item.healthConditionIds!.join(", ")}
              </Text>
            ) : null}
          </View>
        )}

        {/* Policies */}
        {(hasAny(item.viewPolicies) || hasAny(item.viewPolicyIds)) && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <SectionHeader
              title="Data use and privacy"
              subtitle="Organizer-provided policies describing what is collected, why, how it is stored, and who may access it."
            />
            {hasAny(item.viewPolicies) ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.viewPolicies!.map((p, idx) => {
                  const key = `vp-${(p as any).id ?? (p as any).viewPolicyId ?? idx}`;
                  const label = String(
                    (p as any).name ??
                      (p as any).displayName ??
                      (p as any).id ??
                      (p as any).viewPolicyId ??
                      "Policy",
                  );
                  return <Chip key={key} label={label} />;
                })}
              </View>
            ) : hasAny(item.viewPolicyIds) ? (
              <Text style={{ color: c.text.secondary }}>
                Policy IDs: {item.viewPolicyIds!.join(", ")}
              </Text>
            ) : null}
          </View>
        )}

        {/* Tags */}
        {hasAny(item.tags) && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <SectionHeader
              title="Labels"
              subtitle="Labels that describe this study."
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {item.tags!.map((t) => (
                <Chip key={t} label={`#${t}`} />
              ))}
            </View>
          </View>
        )}

        {/* Links (optional) */}
        {(item.privacyUrl || item.termsUrl) && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            <SectionHeader
              title="Official documents"
              subtitle="Links provided by the organizer (e.g., Privacy Policy, Terms & Conditions)."
            />
            {item.privacyUrl ? (
              <Text
                style={{ color: c.primary }}
                onPress={() => Linking.openURL(item.privacyUrl!)}
              >
                Privacy Policy
              </Text>
            ) : null}
            {item.termsUrl ? (
              <Text
                style={{ color: c.primary }}
                onPress={() => Linking.openURL(item.termsUrl!)}
              >
                Terms & Conditions
              </Text>
            ) : null}
          </View>
        )}

        {userId == null && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <SectionHeader
              title="Sign in required"
              subtitle="Sign in to check your session and apply."
            />
          </View>
        )}

        {/* Apply disclosure (always visible before Apply) */}
        <Text style={{ color: c.text.secondary, marginTop: 4, lineHeight: 18 }}>
          {applyDisclosureLine}
        </Text>

        {/* CTAs */}
        <View
          style={{
            flexDirection: "row",
            columnGap: 12,
            rowGap: 12,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <Button
            title={applyTitle}
            onPress={handleApply}
            disabled={applyDisabled}
          />
          <Button
            title={Platform.OS === "ios" ? "Back" : "Back"}
            onPress={() => router.back()}
            variant="ghost"
          />
        </View>

        {/* Sharing status (server snapshot) */}
        {userId != null && (
          <View
            style={{
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 6,
            }}
          >
            <SectionHeader
              title="Your sharing status"
              subtitle="Progress, last share, and your next sharing window. Times shown in your local time."
            />
            {(() => {
              const s = snapshot;
              if (!s) {
                return (
                  <Text style={{ color: c.text.secondary }}>
                    Not sharing yet for this opportunity.
                  </Text>
                );
              }

              const completed = s.segmentsSent >= s.segmentsExpected;
              const nextWin = completed
                ? null
                : computeNextWindowFromSnapshot(
                    s.cycleAnchorUtc,
                    s.lastSentDayIndex,
                    s.segmentsExpected,
                  );

              if (__DEV__ && nextWin) {
                console.log(
                  "[OppDetails] Next share window (server-anchored) =",
                  nextWin,
                );
              }

              const nowIso = new Date(nowTick).toISOString();
              const within =
                nextWin && nextWin.fromUtc <= nowIso && nowIso < nextWin.toUtc;

              const nextLabel = !nextWin
                ? "—"
                : within
                  ? `closes ${formatTimeLeftLabel(nextWin.toUtc, nowTick)}`
                  : `opens ${formatTimeLeftLabel(nextWin.fromUtc, nowTick)}`;

              const fmtLocal = (iso?: string | null) =>
                iso
                  ? new Date(iso).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "—";

              const rc = getShareRuntimeConfig();
              const dayMs = Number(rc.DAY_LENGTH_MS ?? ONE_DAY_MS);
              const graceMs = Number(rc.GRACE_WAIT_MS ?? 0);

              const catchUpInfo = completed
                ? {
                    missedCount: 0,
                    nextMissedDayIndex: null,
                    nextFromUtc: null,
                  }
                : computeMissedCatchUp(
                    {
                      cycleAnchorUtc: s.cycleAnchorUtc,
                      segmentsExpected: s.segmentsExpected,
                      lastSentDayIndex: s.lastSentDayIndex,
                    },
                    nowTick,
                    dayMs,
                    graceMs,
                  );

              const snapStatusUpper = String(
                s.statusName ?? s.statusCode ?? "",
              ).toUpperCase();

              const showCatchUp =
                snapStatusUpper === "ACTIVE" &&
                catchUpInfo.missedCount > 0 &&
                engine?.mode !== "SIM" &&
                engine?.currentDueDayIndex == null;

              return (
                <View style={{ gap: 4 }}>
                  {showCatchUp ? (
                    <View style={{ marginTop: 6, gap: 6 }}>
                      <Text style={{ color: c.text.secondary }}>
                        You missed {catchUpInfo.missedCount} day
                        {catchUpInfo.missedCount === 1 ? "" : "s"}. Catch them
                        up one at a time.
                      </Text>

                      <Button
                        title={
                          catchUpInfo.nextFromUtc
                            ? `Catch up ${fmtMonthDay(catchUpInfo.nextFromUtc)}`
                            : "Catch up"
                        }
                        onPress={doCatchUpOne}
                        disabled={
                          status !== "ACTIVE" ||
                          engine?.currentDueDayIndex != null ||
                          engine?.mode === "SIM"
                        }
                      />
                    </View>
                  ) : null}

                  <Text style={{ color: c.text.secondary }}>
                    <Text style={{ fontWeight: "700", color: c.text.primary }}>
                      Started on:
                    </Text>{" "}
                    {fmtLocal(s.joinTimeLocalISO)}
                  </Text>

                  <Text style={{ color: c.text.secondary }}>
                    <Text style={{ fontWeight: "700", color: c.text.primary }}>
                      Progress:
                    </Text>{" "}
                    {s.segmentsSent}/{s.segmentsExpected}
                  </Text>

                  <Text style={{ color: c.text.secondary }}>
                    <Text style={{ fontWeight: "700", color: c.text.primary }}>
                      Last shared:
                    </Text>{" "}
                    {fmtLocal(s.lastUploadedAt)}
                  </Text>

                  <Text style={{ color: c.text.secondary }}>
                    <Text style={{ fontWeight: "700", color: c.text.primary }}>
                      Last window:
                    </Text>{" "}
                    {s.lastWindowFromUtc ? fmtLocal(s.lastWindowFromUtc) : "—"}{" "}
                    → {s.lastWindowToUtc ? fmtLocal(s.lastWindowToUtc) : "—"}
                  </Text>

                  <Text style={{ color: c.text.secondary }}>
                    <Text style={{ fontWeight: "700", color: c.text.primary }}>
                      Next share:
                    </Text>{" "}
                    {completed
                      ? "Completed"
                      : nextWin
                        ? `${fmtLocal(nextWin.fromUtc)} → ${fmtLocal(nextWin.toUtc)}`
                        : "—"}
                  </Text>

                  <Text style={{ color: c.text.secondary }}>
                    <Text style={{ fontWeight: "700", color: c.text.primary }}>
                      Time left:
                    </Text>{" "}
                    {completed ? "—" : nextLabel}
                  </Text>

                  <View style={{ marginTop: 4 }}>
                    <Chip
                      label={`Status: ${String(s.statusName ?? s.statusCode ?? "—")}`}
                    />
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* DEV-ONLY: Sharing Test Panel (visible only in Test Mode)     */}
        {/* ───────────────────────────────────────────────────────────── */}
        {testFlags.TEST_MODE && (
          <View
            style={{
              marginTop: 16,
              backgroundColor: c.surface,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 10,
            }}
          >
            <Text
              style={{ color: c.text.primary, fontSize: 16, fontWeight: "800" }}
            >
              Sharing Test Panel (DEV)
            </Text>

            {/* Runtime config snapshot */}
            {(() => {
              const rc = getShareRuntimeConfig();
              return (
                <Text style={{ color: c.text.secondary }}>
                  TestMode: {String(rc.TEST_MODE)} | “Day” length:{" "}
                  {rc.DAY_LENGTH_MS} ms | Grace: {rc.GRACE_WAIT_MS} ms | Retry:{" "}
                  {rc.RETRY_INTERVAL_MS} ms
                </Text>
              );
            })()}

            {/* Live session + engine state */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: c.text.secondary }}>
                Status: {status} | Session: {sessionId ?? "—"} | Segments:{" "}
                {engine.segmentsSent}/{segmentsExpected ?? "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Anchor (planner ISO): {cycleAnchorUtc ?? "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Engine anchor:{" "}
                {engine?.cycleAnchorUtc
                  ? new Date(engine.cycleAnchorUtc).toISOString()
                  : "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Last sent day: {engine?.lastSentDayIndex ?? "—"} | Current due:{" "}
                {engine?.currentDueDayIndex ?? "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Retries: {engine?.noDataRetryCount ?? 0} | Next retry:{" "}
                {engine?.nextRetryAtUtc
                  ? new Date(engine.nextRetryAtUtc).toISOString()
                  : "—"}
              </Text>
            </View>

            {/* 🔎 Latest diagnostics from last processed window */}
            <View style={{ gap: 2, marginTop: 6 }}>
              <Text style={{ color: c.text.primary, fontWeight: "700" }}>
                Last Window Diagnostics
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Day: {lastDiag?.dayIndex ?? "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Unavailable (no permission/provider):{" "}
                {(lastDiag?.unavailable ?? []).map(labelOfMetric).join(", ") ||
                  "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Zero data in window:{" "}
                {(lastDiag?.zeroData ?? []).map(labelOfMetric).join(", ") ||
                  "—"}
              </Text>
              <Text style={{ color: c.text.secondary }}>
                Had any data: {String(lastDiag?.hadAnyData ?? "—")}
              </Text>
            </View>

            {/* NEW: Next simulated window preview */}
            {nextWindowPreview ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ color: c.text.primary, fontWeight: "700" }}>
                  Next Simulated Window (Day {nextWindowPreview.idx})
                </Text>
                <Text style={{ color: c.text.secondary }}>
                  Local: {nextWindowPreview.fromLocal} →{" "}
                  {nextWindowPreview.toLocal}
                </Text>
                <Text style={{ color: c.text.secondary }}>
                  UTC: {fmtUTC(nextWindowPreview.fromUtc)} →{" "}
                  {fmtUTC(nextWindowPreview.toUtc)}
                </Text>
              </View>
            ) : (
              <Text style={{ color: c.text.secondary, marginTop: 6 }}>
                Next Simulated Window: —
              </Text>
            )}

            {/* Simulation controls */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 6,
              }}
            >
              <Button
                title="Sim next day"
                onPress={simNextDay}
                disabled={
                  !sessionId ||
                  isProcessing ||
                  status !== "ACTIVE" ||
                  !segmentsExpected ||
                  (engine?.lastSentDayIndex ?? 0) >= (segmentsExpected ?? 0) ||
                  completed
                }
              />
              <Button
                title="Sim all remaining"
                onPress={simAllRemaining}
                variant="secondary"
                disabled={
                  !sessionId || status !== "ACTIVE" || !segmentsExpected
                }
              />
              <Button
                title="Tick now"
                onPress={() => tick()}
                variant="secondary"
                disabled={!sessionId || status !== "ACTIVE"}
              />
              <Button
                title="Catch up"
                onPress={() => useShareStore.getState().catchUpNextOne()}
                variant="secondary"
                disabled={!sessionId || status !== "ACTIVE"}
              />
            </View>

            <Text style={{ color: c.text.secondary, fontStyle: "italic" }}>
              Tip: Sim uses the original join time and backdates by N×24h blocks
              so each due window is a past 24h chunk.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
