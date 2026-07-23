import React from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";

export type DriverTabKey = "Home" | "Jobs" | "Location" | "History";

const TABS: { key: DriverTabKey; label: string; icon: keyof typeof Ionicons.glyphMap; iconOutline: keyof typeof Ionicons.glyphMap }[] = [
  { key: "Home", label: "Home", icon: "home", iconOutline: "home-outline" },
  { key: "Jobs", label: "Jobs", icon: "briefcase", iconOutline: "briefcase-outline" },
  { key: "Location", label: "Location", icon: "map", iconOutline: "map-outline" },
  { key: "History", label: "History", icon: "time", iconOutline: "time-outline" },
];

// Shared segmented Home/Jobs/History control used both by DriverTopTabBar
// (inside the Main tab navigator) and WelcomeScreen (which sits outside the
// tab navigator, in the parent Stack) so the same quick-nav row appears at
// the top of every driver screen, including Welcome.
export function DriverTabSegmentBar({
  activeTab,
  onSelect,
}: {
  activeTab: DriverTabKey | null;
  onSelect: (tab: DriverTabKey) => void;
}) {
  return (
    <View style={styles.segmentGroup}>
      {TABS.map((tab) => {
        const focused = activeTab === tab.key;
        const color = focused ? colors.primaryText : colors.textMuted;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            style={[styles.segment, focused && styles.segmentActive]}
          >
            <Ionicons name={focused ? tab.icon : tab.iconOutline} size={18} color={color} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentGroup: {
    flexDirection: "row",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
