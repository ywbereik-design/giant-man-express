import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { useAuth } from "../auth/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { DriverNavigator } from "./DriverNavigator";
import { AdminNavigator } from "./AdminNavigator";
import { DispatchNavigator } from "./DispatchNavigator";
import { colors } from "../theme/theme";

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export function RootNavigator() {
  const { session, loading } = useAuth();

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
    return <AdminNavigator />;
  }

  return <NavigationContainer theme={navTheme}>{renderApp()}</NavigationContainer>;
}
