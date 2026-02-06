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
          About Web3Health Platform
        </Text>

        {/* Intro */}
        <Text
          style={{
            color: c.text.secondary,
            fontSize: 14,
            textAlign: "center",
            marginHorizontal: 8,
            lineHeight: 20,
          }}
        >
          Web3Health is a research initiative at the University of Georgia (UGA)
          focused on enabling privacy-preserving health data sharing. It was
          initiated by Prof. WenZhan Song and developed by the UGA Center for
          Cyber-Physical Systems (CCPS) and SensorWeb Research Laboratory.
        </Text>

        {/* Section: Research Project & Purpose */}
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
            Web3Health offers a privacy-preserving data sharing platform where
            individuals can selectively share health and activity metrics (such
            as foot step counts, sleep, vital signs, etc.) with approved
            research partners, while maintaining privacy and user control.
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
            </Text>{" "}
            and the{" "}
            <Text style={{ fontWeight: "700" }}>
              UGA Center for Cyber-Physical Systems
            </Text>
            . The app is intended for research use and is not a medical device.
          </Text>
        </SectionCard>

        {/* Section: Faculty Mentors */}
        <SectionCard>
          <Text
            style={{
              color: c.text.primary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Faculty Mentors
          </Text>

          <View style={{ gap: 10 }}>
            <LeadCard
              initials="WS"
              name="Prof. WenZhan Song"
              labLabel="University of Georgia · CCPS / SensorWeb Research Laboratory"
              profileUrl="https://cps.uga.edu/~song"
              email="wsong@uga.edu"
            />

            <LeadCard
              initials="HS"
              name="Prof. Haijian Sun"
              labLabel="University of Georgia"
              profileUrl="https://sunlab.uga.edu/"
              email="hs72164@uga.edu"
            />

            <LeadCard
              initials="TJ"
              name="Prof. Taeho Jung"
              labLabel="University of Notre Dame"
              profileUrl="https://sites.nd.edu/taeho-jung/"
              email="tjung@nd.edu"
            />
          </View>

          <View
            style={{
              marginTop: 10,
              borderTopWidth: 1,
              borderTopColor: c.border,
              paddingTop: 10,
              gap: 6,
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
        </SectionCard>

        {/* Section: More Information */}
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

        {/* Optional: Quick Links */}
        <SectionCard>
          <Text
            style={{
              color: c.text.primary,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Quick Links
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <PillLink
              label="Prof. Song Profile"
              icon="person-outline"
              onPress={() => openUrl("https://cps.uga.edu/~song")}
            />
            <PillLink
              label="SunLab"
              icon="flask-outline"
              onPress={() => openUrl("https://sunlab.uga.edu/")}
            />
            <PillLink
              label="Prof. Jung Profile"
              icon="globe-outline"
              onPress={() => openUrl("https://sites.nd.edu/taeho-jung/")}
            />
            <PillLink
              label="Privacy Docs"
              icon="document-text-outline"
              onPress={() =>
                openUrl("https://web3db.github.io/Web3Health-Privacy/")
              }
            />
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
