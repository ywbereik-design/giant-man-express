import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

// A single sun/moon icon button shared by every role's header — Driver
// (DriverTopTabBar), and Admin/Dispatch/Accountant (their Stack.Navigator
// screenOptions.headerRight, alongside LogoutButton) — so the light/dark
// toggle is reachable by every employee, not just drivers.
export function ThemeToggleButton() {
  const { colors, mode, toggle } = useTheme();

  return (
    <Pressable
      onPress={toggle}
      hitSlop={12}
      style={{ marginRight: 16 }}
      accessibilityRole="button"
      accessibilityLabel={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Ionicons name={mode === "dark" ? "moon" : "sunny"} size={20} color={colors.text} />
    </Pressable>
  );
}
