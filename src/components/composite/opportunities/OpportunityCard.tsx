import Button from "@/src/components/ui/Button";
import Card from "@/src/components/ui/Card";
import Chip from "@/src/components/ui/Chip";
import { Opportunity } from "@/src/services/opportunities/types";
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { Text, View } from "react-native";
export default function OpportunityCard({
    item,
    onPress,
}: {
    item: Opportunity;
    onPress?: (id: string) => void;
}) {
    const c = useThemeColors();
    return (
        <Card style={{ width: 300 }}>
            {/* Visual (placeholder box if no image) */}
            <View
                style={{
                    height: 140,
                    borderRadius: 12,
                    backgroundColor: c.muted,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                }}
            >
                <Ionicons
                    name={
                        item.tags.includes("Sleep") ? "moon" :
                            item.tags.includes("Heart") ? "heart" :
                                item.tags.includes("Nutrition") ? "restaurant" :
                                    "analytics" // fallback icon
                    }
                    size={64}
                    color={c.text.secondary}
                />
            </View>

            {/* Title */}
            <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
                {item.title}
            </Text>

            {/* Reward */}
            <Text style={{ color: c.text.secondary, fontSize: 12, marginTop: 4 }}>
                🏅 {item.reward.badge}
                {typeof item.reward.credits === "number" ? ` · +${item.reward.credits} credits` : ""}
            </Text>

            {/* Tags */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {item.tags.slice(0, 3).map((t) => (
                    <Chip key={t} label={t} />
                ))}
            </View>

            {/* Description */}
            <Text style={{ color: c.text.secondary, fontSize: 12, marginTop: 8 }} numberOfLines={2}>
                {item.description}
            </Text>

            {/* CTA */}
            <Button title="Contribute" onPress={() => onPress?.(item.id)} style={{ marginTop: 12 }} />
        </Card>
    );
}
