import React from "react";
import { View, Pressable, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { LogoutButton } from "./LogoutButton";
import { colors, spacing } from "../theme/theme";

// Replaces the native per-screen header entirely (see DriverNavigator, which
// sets headerShown: false) — otherwise a second `position: absolute, top: 0`
// element (the header) would end up overlapping this one instead of sitting
// above it, since both anchor to the same top edge independently rather than
// stacking. This bar handles its own safe-area top inset for the same reason.
//
// Pinned to the top via `position: absolute` in its own style; DriverNavigator
// measures its height with onLayout and pads the scene content by that much
// so screens never render underneath it.
export function DriverTopTabBar({
  state,
  descriptors,
  navigation,
  onLayout,
}: BottomTabBarProps & { onLayout?: (e: LayoutChangeEvent) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Giant Man Express</Text>
        <LogoutButton />
      </View>
      <View style={styles.segmentGroup}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const label = (options.tabBarLabel as string | undefined) ?? options.title ?? route.name;
          const focused = state.index === index;
          const color = focused ? colors.primaryText : colors.textMuted;

          function onPress() {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              style={[styles.segment, focused && styles.segmentActive]}
            >
              {options.tabBarIcon?.({ focused, color, size: 18 })}
              <Text style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
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
