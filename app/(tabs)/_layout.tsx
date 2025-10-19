import { HapticTab } from '@/components/HapticTab';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { useThemeColors } from '@/src/theme/useThemeColors';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { ParamListBase } from '@react-navigation/native';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TabIcon = ({
  name,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) => (
  <View style={{ transform: [{ scale: focused ? 1.08 : 1 }], opacity: focused ? 1 : 0.8 }}>
    <Ionicons name={name} size={24} color={color} />
  </View>
);

export default function TabLayout() {
  const c = useThemeColors();
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  return (
     <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.text.primary,
        tabBarInactiveTintColor: c.text.secondary,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
            // iOS already handles safe area, but keeping padding helps consistency
            height: 56 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
            backgroundColor: c.bg,
            borderTopColor: c.border,
          },
          default: {
            // Android: explicitly account for the bottom system bar
            height: 56 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
            backgroundColor: c.bg,
            borderTopColor: c.border,
          },
        }),
        tabBarLabelStyle: { fontSize: 11, marginBottom: 6 },
      }}
    >
      {/* Home */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="home" color={focused ? c.primary : c.text.secondary} focused={focused} />
          ),
        }}
      />

      {/* Marketplace */}
      <Tabs.Screen
        name="marketplace"
        options={{
          title: 'Marketplace',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="cart-outline" color={focused ? c.primary : c.text.secondary} focused={focused} />
          ),
        }}
      />

      {/* Sharing (dashboard-like) */}
      <Tabs.Screen
        name="sharing"
        options={{
          title: 'Sharing',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="share-social-outline" color={focused ? c.primary : c.text.secondary} focused={focused} />
          ),
        }}
      />

      {/* More (opens drawer) */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="menu" color={focused ? c.primary : c.text.secondary} focused={focused} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(DrawerActions.openDrawer());
          },
        }}
      />
    </Tabs>
  );
}
