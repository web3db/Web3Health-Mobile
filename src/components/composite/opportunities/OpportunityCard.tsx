import Card from "@/src/components/ui/Card";
import Chip from "@/src/components/ui/Chip";
import { Opportunity } from "@/src/services/opportunities/types";
import { useThemeColors } from "@/src/theme/useThemeColors";
import { Image, Text, TouchableOpacity, View } from "react-native";
export default function OpportunityCard({
    item,
    onPress,
}: {
    item: Opportunity;
    onPress?: (id: string) => void;
}) {
    const c = useThemeColors();
    if (!item) return null;
    const icon = item.icon ? item.icon : null;
    return (
        <Card style={{ width: 300 }}>
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
                {icon && (
                    <Image
                        source={icon}
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            marginRight: 16,
                            backgroundColor: c.muted,
                        }}
                    />
                )}
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
            <TouchableOpacity
                onPress={() => onPress?.(item.id)}
                style={{
                    marginTop: 12,
                    backgroundColor: c.primary,
                    borderRadius: 8,
                    alignSelf: "flex-start",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                }}
            >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Contribute</Text>
            </TouchableOpacity>
        </Card>
    );
}
