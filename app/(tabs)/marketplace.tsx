// app/(tabs)/marketplace.tsx
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
import FiltersRow from "@/src/components/ui/FiltersRow";
import SearchBar from "@/src/components/ui/SearchBar";
import SortButton from "@/src/components/ui/SortButton";
import SkeletonCard from "../../src/components/ui/SkeletonCard";

import { useOpportunities } from "@/src/hooks/useOpportunities";
import { useMarketStore as useMarketplaceStore } from "@/src/store/useMarketStore";

export default function MarketplaceScreen() {
  const c = useThemeColors();
  const { allOpportunities } = useOpportunities();
  const navigation = useNavigation();
  const screenWidth = Dimensions.get('window').width;
  const numColumns = screenWidth < 600 ? 1 : 3;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <FlatList
        data={allOpportunities}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        ListHeaderComponent={
          <View style={{ padding: 16, paddingBottom: 0, marginBottom: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: c.text.primary, textAlign: 'center' }}>Marketplace</Text>
            <Text style={{ fontSize: 15, color: c.text.secondary, marginTop: 6, textAlign: 'center' }}>
              Welcome to the marketplace! Discover opportunities to contribute your health data and earn rewards.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View 
            style={numColumns === 1 ? { marginBottom: 16 } : { flex: 1 / numColumns, paddingHorizontal: 8, marginBottom: 16 }}>
            <OpportunityCard item={item} onPress={() => navigation.navigate('StudyDetails', { id: item.id })} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 24, alignItems: 'center' }}
      />
    </SafeAreaView>
  );
}
