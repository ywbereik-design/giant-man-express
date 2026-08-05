import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DispatchDashboardScreen } from "../screens/dispatch/DispatchDashboardScreen";
import { DriversScreen } from "../screens/admin/DriversScreen";
import { AdminJobsScreen } from "../screens/admin/JobsScreen";
import { SelfieReportsScreen } from "../screens/admin/SelfieReportsScreen";
import { LocationReportsScreen } from "../screens/admin/LocationReportsScreen";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { useTheme } from "../theme/ThemeContext";

export type DispatchStackParamList = {
  Dashboard: undefined;
  Drivers: undefined;
  Jobs: undefined;
  SelfieReports: undefined;
  LocationReports: undefined;
};

const Stack = createNativeStackNavigator<DispatchStackParamList>();

export function DispatchNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => (
          <>
            <ThemeToggleButton />
            <LogoutButton />
          </>
        ),
      }}
    >
      <Stack.Screen name="Dashboard" component={DispatchDashboardScreen} options={{ title: "Giant Man Express" }} />
      <Stack.Screen name="Drivers" component={DriversScreen} options={{ title: "Drivers" }} />
      <Stack.Screen name="Jobs" component={AdminJobsScreen} options={{ title: "Jobs & Dispatch" }} />
      <Stack.Screen name="SelfieReports" component={SelfieReportsScreen} options={{ title: "Selfie Reports" }} />
      <Stack.Screen name="LocationReports" component={LocationReportsScreen} options={{ title: "Live Map" }} />
    </Stack.Navigator>
  );
}
