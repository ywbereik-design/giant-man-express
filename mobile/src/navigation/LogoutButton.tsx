import React from "react";
import { Alert, Pressable, Text } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { colors } from "../theme/theme";

interface Props {
  // Extra reminder appended to the confirmation dialog — used in the driver
  // app, where logging out does NOT clock the driver out server-side (it
  // only stops local location tracking), so an open shift would otherwise
  // silently stay open with no warning.
  warningMessage?: string;
}

export function LogoutButton({ warningMessage }: Props = {}) {
  const { logout } = useAuth();

  function confirmLogout() {
    const message = warningMessage
      ? `Are you sure you want to log out? ${warningMessage}`
      : "Are you sure you want to log out?";
    Alert.alert("Log Out?", message, [
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
