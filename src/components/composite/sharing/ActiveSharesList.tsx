// src/components/composite/sharing/ActiveSharesList.tsx

import Card from "@/src/components/ui/Card";
import Chip from "@/src/components/ui/Chip";
import { useShareStore } from "@/src/store/useShareStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

// === [ACTIVE_SHARES_UTILS]

function fmtInt(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  try {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(v);
  } catch {
    return String(Math.round(v));
  }
}

function fmtPercent(p: number | null | undefined) {
  const v = Number(p ?? 0);
  if (!Number.isFinite(v)) return "0%";
  const clamped = Math.max(0, Math.min(100, Math.round(v)));
  return `${clamped}%`;
}

function fmtDateShort(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function fmtDateWithYear(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function fmtDateTimeShort(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

function getStatusLabel(uiStatus: "onTrack" | "behind") {
  if (uiStatus === "behind") return "Behind";
  return "On track";
}

function getStatusChipTone(
  uiStatus: "onTrack" | "behind",
  c: ReturnType<typeof useThemeColors>
) {
  if (uiStatus === "behind") {
    return {
      bg: c.warning + "33",
      text: c.warning,
      border: c.warning + "55",
    };
  }
  return {
    bg: c.success + "33",
    text: c.success,
    border: c.success + "55",
  };
}

// === [ACTIVE_SHARES_COMPONENT]

export default function ActiveSharesList() {
  const c = useThemeColors();
  const activeSessions = useShareStore((s) => s.activeSessions);
  const router = useRouter();

  const sortedSessions = useMemo(() => {
    if (!activeSessions || activeSessions.length === 0) {
      return [];
    }
    const list = activeSessions.slice();
    list.sort((a, b) => {
      const aKey = a.expectedCompletionDate || a.joinTimeLocal;
      const bKey = b.expectedCompletionDate || b.joinTimeLocal;
      return aKey.localeCompare(bKey);
    });
    return list;
  }, [activeSessions]);

  if (sortedSessions.length === 0) {
    return null;
  }

  return (
    <Card>
      {/* === [ACTIVE_SHARES_HEADER] */}
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: "700" }}>
        Active studies
      </Text>
      <Text
        style={{
          color: c.text.secondary,
          fontSize: 12,
          marginTop: 4,
        }}
      >
        Studies where your data is currently being shared.
      </Text>

      {/* === [ACTIVE_SHARES_LIST] */}
      <View style={{ marginTop: 12, gap: 12 }}>
        {sortedSessions.map((s) => {
          const totalDays = s.segmentsExpected ?? 0;
          const sentDays = s.segmentsSent ?? 0;
          const pct = fmtPercent(s.progressPct);
          const joined = fmtDateWithYear(s.joinTimeLocal);
          const expected = fmtDateWithYear(s.expectedCompletionDate);
          const lastData = s.lastSegmentCreatedOn
            ? fmtDateTimeShort(s.lastSegmentCreatedOn)
            : "";
          const missed = s.missedWindowsCount ?? 0;
          const statusTone = getStatusChipTone(s.uiStatus, c);
          const statusLabel = getStatusLabel(s.uiStatus);

          return (
            <Pressable
              key={s.sessionId}
              onPress={() =>
                router.push({
                  pathname: "/(app)/opportunities/[id]",
                  params: { id: String(s.postingId) },
                })
              }
              style={{
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
              }}
            >
              {/* Title row with status chip */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text
                    style={{
                      color: c.text.primary,
                      fontWeight: "600",
                      fontSize: 15,
                    }}
                    numberOfLines={1}
                  >
                    {s.postingTitle || `Study #${s.postingId}`}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: statusTone.border,
                    backgroundColor: statusTone.bg,
                  }}
                >
                  <Text
                    style={{
                      color: statusTone.text,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    {statusLabel}
                  </Text>
                </View>
              </View>

              {/* Buyer and reward row */}
              <Text
                style={{
                  color: c.text.secondary,
                  fontSize: 12,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {s.buyerName} • {s.rewardLabel}
              </Text>

              {/* Progress row */}
              <View style={{ marginTop: 6, flexDirection: "row", gap: 8 }}>
                <Text
                  style={{
                    color: c.text.primary,
                    fontSize: 13,
                    fontWeight: "500",
                  }}
                >
                  {fmtInt(sentDays)} / {fmtInt(totalDays)} days
                </Text>
                <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                  {pct} complete
                </Text>
              </View>

              {/* Dates row */}
              <View style={{ marginTop: 4 }}>
                <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                  Joined {joined}
                  {expected ? ` • Expected ${expected}` : ""}
                </Text>
              </View>

              {/* Activity row */}
              <View style={{ marginTop: 4, flexDirection: "row", gap: 8 }}>
                <Text style={{ color: c.text.secondary, fontSize: 12 }}>
                  Last data
                  {lastData ? `: ${lastData}` : ": not sent yet"}
                </Text>
                {missed > 0 ? (
                  <Chip
                    label={`Missed ${fmtInt(missed)} day${
                      missed === 1 ? "" : "s"
                    }`}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
