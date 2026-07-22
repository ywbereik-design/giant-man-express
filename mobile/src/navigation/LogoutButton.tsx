import React from "react";
import { Alert, Pressable, Text } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { colors } from "../theme/theme";

export function LogoutButton() {
  const { logout } = useAuth();

  function confirmLogout() {
    Alert.alert("Log Out?", "Are you sure you want to log out?", [
      { text: "Back", style: "cancel" },
      { text: "Yes", style: "destructive", onPress: () => logout() },
    ]);
  }

  return (
    <Pressable onPress={confirmLogout} hitSlop={12} style={{ marginRight: 16 }}>
      <Text style={{ color: colors.primary, fontWeight: "600" }}>Log Out</Text>
    </Pressable>
  );
}
