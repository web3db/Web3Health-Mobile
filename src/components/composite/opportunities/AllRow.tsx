// AllRow.tsx (swap this file with your current one)
import { useMarketStore } from "@/src/store/useMarketStore"; // ✅ use the marketplace store
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import Carousel from "./Carousel";

type Props = {
  pageSize?: number;       // how many to fetch initially for Home
  sort?: "newest" | "reward";
};
export default function AllRow({ pageSize = 10, sort = "newest" }: Props) {
  const c = useThemeColors();
  const {
    items,
    loading,
    hasNext,
    sort: storeSort,
    setSort,
    loadAll,
    loadMore,
  } = useMarketStore();

  // One-time prime for Home: fetch only if empty; align sort once
  const primed = useRef(false);
  useEffect(() => {
    if (storeSort !== sort) setSort(sort);
    if (!primed.current && items.length === 0) {
      primed.current = true;
      loadAll({ page: 1, pageSize });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, pageSize, sort]);

  // Take the first N for the row
  const data = useMemo(() => items.slice(0, pageSize), [items, pageSize]);

  // Navigation
  const goAll = () => router.push("/marketplace");
  const goFocus = (id: string | number) =>
    router.push(`/opportunities/${encodeURIComponent(String(id))}`);

  return (
    <View style={{ marginTop: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: c.text.primary, fontSize: 18, fontWeight: "800" }}>
          All Opportunities
        </Text>
        <Pressable onPress={goAll} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: c.text.secondary, fontWeight: "700" }}>View All Opportunities</Text>
          <Ionicons name="arrow-forward" size={18} color={c.text.secondary} />
        </Pressable>
      </View>

      <Carousel
        data={data}
        loading={loading && data.length === 0}
        onPressCard={(id) => goFocus(id)}
        onPressViewAll={goAll}
        viewAllLabel="View All Opportunities"
        onEndReached={() => {
          if (!loading && hasNext) loadMore();
        }}
      />

      {/* optional: lightweight error banner if your store exposes one */}
      {/* {error && (
        <Text style={{ color: c.danger, paddingHorizontal: 16, marginTop: 6 }}>
          Failed to load opportunities.
        </Text>
      )} */}
    </View>
  );
}
