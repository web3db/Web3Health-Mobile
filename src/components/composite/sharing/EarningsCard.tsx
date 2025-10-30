//src/components/composite/sharing/EarningsCard.tsx
// === [EARNINGS_CARD_IMPORTS]
import Card from "@/src/components/ui/Card";
import Chip from "@/src/components/ui/Chip";
import { useShareStore } from "@/src/store/useShareStore";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

// === [EARNINGS_CARD_UTILS]
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

// === [EARNINGS_CARD_COMPONENT]
export default function EarningsCard() {
  const c = useThemeColors();
  const rewards = useShareStore((s) => s.rewards);

  if (!rewards) return null;

  const grandTotal = rewards.totals?.grandTotals?.value ?? 0;

  const foundersPromo = useMemo(() => {
    return (rewards.promotions || []).find(
      (p) => p.rewardTypeCode === "FOUNDERS"
    );
  }, [rewards.promotions]);

  const breakdown = rewards.breakdown || [];
  const recent = useMemo(() => {
    const list = (rewards.postings || [])
      .slice()
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    return list.slice(0, 3);
  }, [rewards.postings]);

  return (
    <Card>
      {/* === [EARNINGS_CARD_HEADER] */}
      <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: "700" }}>
        Rewards
      </Text>

      {/* === [EARNINGS_CARD_TOTAL] */}
      <View style={{ marginTop: 6 }}>
        <Text style={{ color: c.text.secondary, fontSize: 12 }}>
          Total credits
        </Text>
        <Text style={{ color: c.text.primary, fontSize: 28, fontWeight: "800" }}>
          {fmtInt(grandTotal)} credits
        </Text>
      </View>

      {/* === [EARNINGS_CARD_BREAKDOWN] */}
      {breakdown.length > 0 ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={{ color: c.text.secondary, fontSize: 12 }}>
            By type
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {breakdown.map((b) => (
              <Chip
                key={b.code}
                label={`${b.displayName}: ${fmtInt(b.totalValue)} credits${
                  b.postingsCompleted ? ` • ${b.postingsCompleted}` : ""
                }`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* === [EARNINGS_CARD_FOUNDERS_PROMO] */}
      {foundersPromo ? (
        <View
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Text style={{ color: c.text.primary, fontWeight: "700" }}>
            {foundersPromo.rewardTypeName || "Founders Credits"}
          </Text>
          <Text style={{ color: c.text.secondary, marginTop: 2 }}>
            {fmtInt(foundersPromo.amount)} credits
            {foundersPromo.grantedVirtualAt
              ? ` • ${fmtDateShort(foundersPromo.grantedVirtualAt)}`
              : ""}
          </Text>
          {foundersPromo.reason ? (
            <Text style={{ color: c.text.secondary, marginTop: 2 }}>
              {foundersPromo.reason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* === [EARNINGS_CARD_RECENT] */}
      {recent.length > 0 ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={{ color: c.text.secondary, fontSize: 12 }}>
            Recent rewards
          </Text>
          <View style={{ gap: 8 }}>
            {recent.map((p) => (
              <View
                key={p.postingId}
                style={{
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                }}
              >
                <Text
                  style={{ color: c.text.primary, fontWeight: "600" }}
                  numberOfLines={1}
                >
                  {p.title || `Posting #${p.postingId}`}
                </Text>
                <Text style={{ color: c.text.secondary, marginTop: 2 }}>
                  {p.rewardTypeName || p.rewardTypeCode} • {fmtInt(p.rewardValue)} credits
                  {p.completedAt ? ` • ${fmtDateShort(p.completedAt)}` : ""}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Dev footnote (optional) */}
      {__DEV__ && rewards.sourceNotes ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: c.text.muted, fontSize: 11 }}>
            Counting rule: {rewards.sourceNotes.countingRule}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
