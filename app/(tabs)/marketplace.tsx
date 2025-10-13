import { Link } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useThemeColors } from "@/src/theme/useThemeColors";

import OpportunityCard from "@/src/components/composite/opportunities/OpportunityCard";
import EmptyState from "@/src/components/ui/EmptyState";
import SearchBar from "@/src/components/ui/SearchBar";
import SortButton from "@/src/components/ui/SortButton";
import SkeletonCard from "../../src/components/ui/SkeletonCard";

import { useOpportunities } from "@/src/hooks/useOpportunities";
import { useMarketStore as useMarketplaceStore } from "@/src/store/useMarketStore";

export default function MarketplaceScreen() {
  const c = useThemeColors();
  const listRef = useRef<FlatList>(null);

  // Store state (Marketplace-only)
  const {
    items,
    loading,
    query,
    selectedTags,
    minCredits,
    sort,
    savedIds,
    lastListOffset,
    loadAll,
    setQuery,
    toggleTag,
    setMinCredits,
    setSort,
    clearFilters,
    setListOffset,
    filteredItems,
  } = useMarketplaceStore();

  // Facets from seed (normalized)
  const { categories, popularTags } = useOpportunities();

  // Responsive columns
  const screenWidth = Dimensions.get("window").width;
  const numColumns = screenWidth < 600 ? 1 : 2;

  // Derived list (depend on inputs so recompute correctly)
  const data = useMemo(
    () => filteredItems(),
    [items, query, selectedTags, minCredits, sort] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Load data on mount
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Restore scroll after data mounts
  useEffect(() => {
    const id = setTimeout(() => {
      if (lastListOffset && listRef.current) {
        listRef.current.scrollToOffset({ offset: lastListOffset, animated: false });
      }
    }, 0);
    return () => clearTimeout(id);
  }, [lastListOffset]);

  // Keyboard-safe onScroll capture
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setListOffset(e.nativeEvent.contentOffset.y);
    },
    [setListOffset]
  );

  // Cycle sort
  const onToggleSort = useCallback(() => {
    setSort(sort === "newest" ? "reward" : "newest");
  }, [sort, setSort]);

  // no-op category handler (wired later)
  const onToggleCategory = useCallback((/* cat: string */) => { }, []);

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

          {/* Filters */}
          {/* <View style={{ marginBottom: 12 }}>
            <FiltersRow
              categories={categories}
              tags={popularTags}
              selectedCategories={[]} // categories optional for now
              selectedTags={selectedTags}
              minCredits={minCredits}
              onToggleCategory={onToggleCategory}
              onToggleTag={toggleTag}
              onSetMinCredits={setMinCredits}
              onClearAll={clearFilters}
            />
          </View> */}

          {/* List */}
          <FlatList
            ref={listRef}
            data={data}
            keyExtractor={(item) => item.id}
            onScroll={onScroll}
            numColumns={numColumns}
            style={{ backgroundColor: c.bg }}
            columnWrapperStyle={numColumns > 1 ? { gap: 12 } : undefined}
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
            renderItem={({ item }) => (
              <View style={{ flex: 1, paddingHorizontal: numColumns > 1 ? 6 : 0, marginBottom: 12 }}>
                <Link href={{ pathname: "/opportunities/[id]", params: { id: item.id } }} asChild>
                  <Pressable accessibilityRole="button">
                    <OpportunityCard item={item as any} />
                  </Pressable>
                </Link>
              </View>
            )}
            contentContainerStyle={{
              paddingBottom: 24,
              paddingTop: 4,
              maxWidth: 720,
              alignSelf: 'center',
              width: '100%',
              paddingHorizontal: 4,
            }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
