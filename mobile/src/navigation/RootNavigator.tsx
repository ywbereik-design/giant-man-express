import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { DriverNavigator } from "./DriverNavigator";
import { AdminNavigator } from "./AdminNavigator";
import { DispatchNavigator } from "./DispatchNavigator";
import { AccountantNavigator } from "./AccountantNavigator";
import { useTheme } from "../theme/ThemeContext";

export function RootNavigator() {
  const { session, loading } = useAuth();
  const { colors, mode } = useTheme();

  const navTheme = {
    ...DefaultTheme,
    dark: mode === "dark",
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  function renderApp() {
    if (!session) return <LoginScreen />;
    if (session.role === "DRIVER") return <DriverNavigator />;
    if (session.role === "DISPATCH") return <DispatchNavigator />;
    if (session.role === "ACCOUNTANT") return <AccountantNavigator />;
    return <AdminNavigator />;
  }

  return <NavigationContainer theme={navTheme}>{renderApp()}</NavigationContainer>;
}
