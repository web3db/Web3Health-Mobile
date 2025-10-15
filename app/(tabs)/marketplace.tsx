import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemeColors } from "@/src/theme/useThemeColors";

import OpportunityCard from "@/src/components/composite/opportunities/OpportunityCard";
import EmptyState from "@/src/components/ui/EmptyState";
import SearchBar from "@/src/components/ui/SearchBar";
import SkeletonCard from "@/src/components/ui/SkeletonCard";
import SortButton from "@/src/components/ui/SortButton";

import { useOpportunities } from "@/src/hooks/useOpportunities";
import { useMarketStore as useMarketplaceStore } from "@/src/store/useMarketStore";

export default function MarketplaceScreen() {
  const c = useThemeColors();
  const listRef = useRef<FlatList<any>>(null);

  // Store state (Marketplace-only)
  const {
    items,
    loading,
    query,
    selectedTags,
    minCredits,
    sort,
    lastListOffset,
    loadAll,
    setQuery,
    setSort,
    clearFilters,
    setListOffset,
    filteredItems,
    loadMore,
    hasNext,
  } = useMarketplaceStore();

  // Facets (kept for later filters UI)
  useOpportunities();

  // Responsive columns (updates on rotation)
  const { width } = useWindowDimensions();
  const numColumns = width < 600 ? 1 : 2;

  // Derived list
  const data = useMemo(
    () => filteredItems(),
    [items, query, selectedTags, minCredits, sort] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // --- Prevent double-fetch in dev (Strict Mode) ---
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    loadAll({ page: 1, pageSize: 10 });
  }, [loadAll]);

  // --- Restore scroll offset once on first paint (if any) ---
  useEffect(() => {
    if (lastListOffset && lastListOffset > 0 && listRef.current) {
      const id = setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: lastListOffset, animated: false });
      }, 0);
      return () => clearTimeout(id);
    }
  }, [lastListOffset]);

  // Track current scroll position for persistence
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setListOffset(e.nativeEvent.contentOffset.y);
    },
    [setListOffset]
  );

  // Toggle sort
  const onToggleSort = useCallback(() => {
    setSort(sort === "newest" ? "reward" : "newest");
  }, [sort, setSort]);

  // Stable key extractor
  const keyExtractor = useCallback((item: { id: string | number }) => String(item.id), []);

  // Navigate to details
  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <View style={{ flex: 1, paddingHorizontal: numColumns > 1 ? 6 : 0, marginBottom: 12 }}>
        <OpportunityCard
          item={item}
          onPress={() => router.push({ pathname: "/opportunities/[id]", params: { id: String(item.id) } })}
        />
      </View>
    ),
    [numColumns]
  );

  // Guard onEndReached firing multiple times during momentum/short lists
  const reachedDuringMomentum = useRef(false);
  const handleEndReached = useCallback(() => {
    if (loading || !hasNext || reachedDuringMomentum.current) return;
    reachedDuringMomentum.current = true;
    loadMore();
  }, [loading, hasNext, loadMore]);

  const onMomentumScrollBegin = useCallback(() => {
    reachedDuringMomentum.current = false;
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, backgroundColor: c.bg, paddingHorizontal: 16 }}>
          {/* Heading */}
          <View style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: c.text.primary, fontSize: 20, fontWeight: "800" }}>Marketplace</Text>
            <Text style={{ color: c.text.secondary, marginTop: 4, textAlign: "center" }}>
              Discover opportunities to contribute your health data and earn rewards.
            </Text>
          </View>

          {/* Search + Sort */}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <SearchBar value={query} onChange={setQuery} />
            </View>
            <SortButton sort={sort} onToggle={onToggleSort} />
          </View>

          {/* List */}
          <FlatList
            ref={listRef}
            data={data}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            numColumns={numColumns}
            style={{ backgroundColor: c.bg }}
            columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
            // Scrolling performance
            scrollEventThrottle={16}
            decelerationRate={Platform.OS === "ios" ? "normal" : 0.98}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={Platform.OS === "android"} // avoids white flash on iOS
            // Scroll state + pagination
            onScroll={onScroll}
            onEndReachedThreshold={0.5}
            onMomentumScrollBegin={onMomentumScrollBegin}
            onEndReached={handleEndReached}
            // Footer / Empty
            ListFooterComponent={
              loading ? (
                <View style={{ paddingVertical: 16 }}>
                  <Text style={{ textAlign: "center" }}>Loading…</Text>
                </View>
              ) : !hasNext ? (
                <View style={{ paddingVertical: 16 }}>
                  <Text style={{ textAlign: "center", opacity: 0.6 }}>No more postings</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              loading ? (
                <View style={{ paddingHorizontal: 8, gap: 12, paddingVertical: 16 }}>
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </View>
              ) : (
                <EmptyState onReset={clearFilters} />
              )
            }
            contentContainerStyle={{
              paddingBottom: 24,
              paddingTop: 4,
              maxWidth: 720,
              alignSelf: "center",
              width: "100%",
              paddingHorizontal: 4,
            }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
