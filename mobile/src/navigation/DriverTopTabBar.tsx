import React, { useMemo } from "react";
import { View, Pressable, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LogoutButton } from "./LogoutButton";
import { DriverTabSegmentBar, DriverTabKey } from "./DriverTabSegmentBar";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

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
  const { colors, mode, toggle } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.getParent()?.goBack()}
          hitSlop={12}
          style={styles.backButton}
          accessibilityLabel="Back to Welcome"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Giant Man Express</Text>
        <Pressable
          onPress={toggle}
          hitSlop={12}
          style={styles.themeToggle}
          accessibilityLabel={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <Ionicons name={mode === "dark" ? "moon" : "sunny"} size={20} color={colors.text} />
        </Pressable>
        <LogoutButton warningMessage="If you're still clocked in, this won't end your shift — clock out first if you're done for the day." />
      </View>
      <DriverTabSegmentBar
        activeTab={state.routes[state.index].name as DriverTabKey}
        onSelect={(tab) => {
          const route = state.routes.find((r) => r.name === tab);
          if (!route) return;
          const focused = state.routes[state.index].name === tab;
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    backButton: {
      width: 24,
      alignItems: "flex-start",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: "700",
    },
    themeToggle: {
      padding: 2,
    },
  });
}
