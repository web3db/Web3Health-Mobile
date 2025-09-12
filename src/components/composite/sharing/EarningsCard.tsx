import { useThemeColors } from "@/src/theme/useThemeColors";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Card from "../../ui/Card";

export default function EarningsCard() {
    const c = useThemeColors();
    const totalEarnings = 9999; // REPLACE WITH USER STORE
    return (
        <View style={{ marginTop: 16 }}>
            <Text
                style={{
                  color: c.text.primary, fontSize: 18, fontWeight: "800",
                  paddingHorizontal: 16, marginBottom: 8
                }}
              >
                Current Earnings
        </Text>
        <Card style={{ marginHorizontal: 12, padding: 16 }}>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: "center", marginTop: 4 }}>
                <Text style={{ color: c.text.primary, fontSize: 50, fontWeight: '800' }}>
                    {`${totalEarnings}`}
                </Text>
                <Text style={{ color: c.text.secondary, fontSize: 30, marginLeft: 6, paddingBottom: 5 }}>Credits</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                <TouchableOpacity
                    style={{
                        backgroundColor: c.primary,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 8,
                        width: '48%',
                        alignItems: 'center',
                    }}
                    onPress={() => console.log("Redeem Pressed")}
                >
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: "700" }}>Redeem</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                    style={{
                        backgroundColor: c.text.secondary,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 8,
                        width: '48%',
                        alignItems: 'center',
                    }}
                    onPress={() => console.log("View History Pressed")}
                >
                    <Text style={{ color: 'white', fontSize: 16, fontWeight: "700" }}>View History</Text>
                </TouchableOpacity>
            </View>

        </Card>
    </View>
    );
}
