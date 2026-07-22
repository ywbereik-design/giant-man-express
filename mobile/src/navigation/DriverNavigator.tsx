import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/driver/HomeScreen";
import { DriverJobsScreen } from "../screens/driver/JobsScreen";
import { HistoryScreen } from "../screens/driver/HistoryScreen";
import { LogoutButton } from "./LogoutButton";
import { colors } from "../theme/theme";

const Tab = createBottomTabNavigator();

export function DriverNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Jobs" component={DriverJobsScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}
