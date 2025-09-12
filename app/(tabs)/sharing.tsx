import EarningsCard from "@/src/components/composite/sharing/EarningsCard";
import ParticipatingRow from "@/src/components/composite/sharing/ParticipatingRow";
import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { SafeAreaView, Text, View } from "react-native";

export default function Sharing() {
  const c = useThemeColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top','bottom']}>
      <View>
        <Text>Sharing</Text>
        <EarningsCard />
        <ParticipatingRow />
      </View>
    </SafeAreaView>
  )
}