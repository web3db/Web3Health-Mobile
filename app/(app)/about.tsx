// app/(app)/about.tsx
import BackButton from "@/src/components/ui/BackButton";
import { useThemeColors } from "@/src/theme/useThemeColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import React from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export default function AboutScreen() {
  const c = useThemeColors();

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const openEmail = (email: string) => {
    Linking.openURL(`mailto:${email}`).catch(() => {});
  };

  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        gap: 10,
      }}
    >
      {children}
    </View>
  );

  const PillLink = ({
    label,
    icon,
    onPress,
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.muted : c.elevated,
        marginRight: 8,
        marginBottom: 8,
        gap: 6,
      })}
    >
      <Ionicons name={icon} size={14} color={c.text.secondary} />
      <Text
        style={{
          color: c.text.primary,
          fontSize: 12,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const LinkText = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <Pressable onPress={onPress}>
      <Text
        style={{
          color: c.primary,
          textDecorationLine: "underline",
          fontSize: 14,
          marginBottom: 2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const LeadCard = ({
    initials,
    name,
    labLabel,
    profileUrl,
    email,
  }: {
    initials: string;
    name: string;
    labLabel: string;
    profileUrl: string;
    email: string;
  }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: c.elevated,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      {/* Circle avatar */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: c.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: c.text.inverse,
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          {initials}
        </Text>
      </View>

      {/* Details */}
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            color: c.text.primary,
            fontSize: 14,
            fontWeight: "700",
          }}
        >
          {name}
        </Text>
        <Text
          style={{
            color: c.text.secondary,
            fontSize: 13,
          }}
        >
          {labLabel}
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 6,
          }}
        >
          <Pressable
            onPress={() => openUrl(profileUrl)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: pressed ? c.muted : c.surface,
              borderWidth: 1,
              borderColor: c.border,
              gap: 6,
            })}
          >
            <Ionicons name="globe-outline" size={14} color={c.text.secondary} />
            <Text
              style={{
                color: c.text.primary,
                fontSize: 12,
                fontWeight: "500",
              }}
            >
              Profile
            </Text>
          </Pressable>

          <Pressable
            onPress={() => openEmail(email)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: pressed ? c.muted : c.surface,
              borderWidth: 1,
              borderColor: c.border,
              gap: 6,
            })}
          >
            <Ionicons name="mail-outline" size={14} color={c.text.secondary} />
            <Text
              style={{
                color: c.text.primary,
                fontSize: 12,
                fontWeight: "500",
              }}
            >
              Email
            </Text>
          </Pressable>
        </View>

        {/* Email text below for easy copy */}
        <Text
          style={{
            color: c.text.muted,
            fontSize: 12,
            marginTop: 4,
          }}
        >
          {email}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "bottom"]}
    >
      <BackButton />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{
          padding: 16,
          gap: 18,
          paddingBottom: 40,
        }}
      >
        {/* Title */}
        <Text
          style={{
            color: c.text.primary,
            fontSize: 22,
            fontWeight: "800",
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          About Web3Health
        </Text>

        <Text
          style={{
            color: c.text.secondary,
            fontSize: 14,
            textAlign: "center",
            marginHorizontal: 8,
          }}
        >
          A research initiative at the University of Georgia exploring
          privacy-preserving health data sharing.
        </Text>

        {/* Section: Affiliations */}
        <SectionCard>
          <Text
            style={{
              color: c.text.primary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Institutional Affiliations
          </Text>

          <Text
            style={{
              color: c.text.primary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            This project is conducted under the{" "}
            <Text style={{ fontWeight: "600" }}>
              Institute for Cyber-Physical Systems (CCPS)
            </Text>{" "}
            at the University of Georgia, in collaboration with the{" "}
            <Text style={{ fontWeight: "600" }}>SensorWeb Lab</Text>.
          </Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginTop: 8,
            }}
          >
            <PillLink
              label="CCPS"
              icon="business-outline"
              onPress={() => openUrl("https://cps.uga.edu/")}
            />
            <PillLink
              label="SensorWeb Lab"
              icon="school-outline"
              onPress={() =>
                openUrl("https://sensorweb.engr.uga.edu/index.php/song/")
              }
            />
            <PillLink
              label="SunLab"
              icon="flash-outline"
              onPress={() => openUrl("https://sunlab.uga.edu/")}
            />
          </View>

          {/* Optional raw links below for clarity / copy */}
          <View style={{ marginTop: 6 }}>
            <LinkText
              label="https://cps.uga.edu/"
              onPress={() => openUrl("https://cps.uga.edu/")}
            />
            <LinkText
              label="SensorWeb Lab · Prof. WenZhan Song"
              onPress={() =>
                openUrl("https://sensorweb.engr.uga.edu/index.php/song/")
              }
            />
            <LinkText
              label="SunLab · Prof. Haijian Sun"
              onPress={() => openUrl("https://sunlab.uga.edu/")}
            />
          </View>
        </SectionCard>

        {/* Section: Research purpose */}
        <SectionCard>
          <Text
            style={{
              color: c.text.primary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Research Project & Purpose
          </Text>

          <Text
            style={{
              color: c.text.primary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Web3Health studies how individuals can track and selectively share
            health and activity metrics (such as steps, sleep, and related
            measures) with approved research partners while maintaining strong
            privacy and user control.
          </Text>

          <Text
            style={{
              color: c.text.primary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            This research is supported in part by funding from the{" "}
            <Text style={{ fontWeight: "700" }}>
              National Science Foundation (NSF)
            </Text>
            . The app is intended for research use and is not a medical device.
          </Text>
        </SectionCard>

        {/* Section: Project leads */}
        <SectionCard>
          <Text
            style={{
              color: c.text.primary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Project Leads
          </Text>

          <View style={{ gap: 10 }}>
            <LeadCard
              initials="WS"
              name="Prof. WenZhan Song"
              labLabel="SensorWeb Lab, University of Georgia"
              profileUrl="https://sensorweb.engr.uga.edu/index.php/song/"
              email="wsong@uga.edu"
            />

            <LeadCard
              initials="HS"
              name="Prof. Haijian Sun"
              labLabel="SunLab, University of Georgia"
              profileUrl="https://sunlab.uga.edu/"
              email="hs72164@uga.edu"
            />

            <View
              style={{
                marginTop: 4,
                borderTopWidth: 1,
                borderTopColor: c.border,
                paddingTop: 8,
                gap: 4,
              }}
            >
              <Text
                style={{
                  color: c.text.primary,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                General Lab Contact
              </Text>
              <LinkText
                label="engr-sensorweb@uga.edu"
                onPress={() => openEmail("engr-sensorweb@uga.edu")}
              />
            </View>
          </View>
        </SectionCard>

        {/* Section: More info */}
        <SectionCard>
          <Text
            style={{
              color: c.text.primary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            More Information
          </Text>

          <Text
            style={{
              color: c.text.primary,
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            Documentation about Web3Health’s data handling and privacy model is
            available at:
          </Text>

          <LinkText
            label="https://web3db.github.io/Web3Health-Privacy/"
            onPress={() =>
              openUrl("https://web3db.github.io/Web3Health-Privacy/")
            }
          />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
