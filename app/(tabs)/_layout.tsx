import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { TabIcon } from '@/components/TabIcon';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme';

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Prices',
          tabBarIcon: ({ color, size }) => <TabIcon name="prices" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="calculator"
        options={{
          title: 'Calculator',
          tabBarIcon: ({ color, size }) => <TabIcon name="calculator" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => <TabIcon name="inventory" color={color} size={size} />,
          // Refining lives one tap off inventory rather than as a sixth tab: it
          // is where stock goes, and the tab bar is already full.
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refining lots"
              onPress={() => router.push('/lots')}
              hitSlop={8}
              style={({ pressed }) => [{ paddingHorizontal: 16 }, pressed && { opacity: 0.6 }]}
            >
              <Text style={{ color: colors.gold, fontWeight: '600', fontSize: 15 }}>Lots</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarIcon: ({ color, size }) => <TabIcon name="customers" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <TabIcon name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
