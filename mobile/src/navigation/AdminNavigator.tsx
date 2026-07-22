import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { DashboardScreen } from "../screens/admin/DashboardScreen";
import { DriversScreen } from "../screens/admin/DriversScreen";
import { JobTypesScreen } from "../screens/admin/JobTypesScreen";
import { BusinessesScreen } from "../screens/admin/BusinessesScreen";
import { AdminJobsScreen } from "../screens/admin/JobsScreen";
import { ReportsScreen } from "../screens/admin/ReportsScreen";
import { LocationReportsScreen } from "../screens/admin/LocationReportsScreen";
import { SelfieReportsScreen } from "../screens/admin/SelfieReportsScreen";
import { InvoicesScreen } from "../screens/admin/InvoicesScreen";
import { StaffScreen } from "../screens/admin/StaffScreen";
import { LogoutButton } from "./LogoutButton";
import { colors } from "../theme/theme";

export type AdminStackParamList = {
  Dashboard: undefined;
  Drivers: undefined;
  JobTypes: undefined;
  Businesses: undefined;
  Jobs: undefined;
  Reports: undefined;
  LocationReports: undefined;
  SelfieReports: undefined;
  Invoices: undefined;
  Staff: undefined;
};

const Stack = createNativeStackNavigator<AdminStackParamList>();

export function AdminNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
        headerRight: () => <LogoutButton />,
      }}
    >
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Giant Man Express" }} />
      <Stack.Screen name="Drivers" component={DriversScreen} options={{ title: "Drivers" }} />
      <Stack.Screen name="JobTypes" component={JobTypesScreen} options={{ title: "Job Types" }} />
      <Stack.Screen name="Businesses" component={BusinessesScreen} options={{ title: "Businesses" }} />
      <Stack.Screen name="Jobs" component={AdminJobsScreen} options={{ title: "Jobs & Dispatch" }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: "Hours Reports" }} />
      <Stack.Screen name="LocationReports" component={LocationReportsScreen} options={{ title: "Location Reports" }} />
      <Stack.Screen name="SelfieReports" component={SelfieReportsScreen} options={{ title: "Selfie Reports" }} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} options={{ title: "Invoices" }} />
      <Stack.Screen name="Staff" component={StaffScreen} options={{ title: "Staff Accounts" }} />
    </Stack.Navigator>
  );
}
