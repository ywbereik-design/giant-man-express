import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AccountantDashboardScreen } from "../screens/accountant/AccountantDashboardScreen";
import { InvoicesScreen } from "../screens/admin/InvoicesScreen";
import { ReportsScreen } from "../screens/admin/ReportsScreen";
import { HoursByBusinessScreen } from "../screens/admin/HoursByBusinessScreen";
import { BusinessesScreen } from "../screens/admin/BusinessesScreen";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { useTheme } from "../theme/ThemeContext";

export type AccountantStackParamList = {
  Dashboard: undefined;
  Invoices: undefined;
  Reports: undefined;
  HoursByBusiness: undefined;
  Businesses: undefined;
};

const Stack = createNativeStackNavigator<AccountantStackParamList>();

// Reuses the same screens AdminNavigator uses for these four areas rather
// than duplicating them — both roles need the identical invoices/reports/
// businesses UI, just reached from a different, narrower menu.
export function AccountantNavigator() {
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
      <Stack.Screen name="Dashboard" component={AccountantDashboardScreen} options={{ title: "Giant Man Express" }} />
      <Stack.Screen name="Invoices" component={InvoicesScreen} options={{ title: "Invoices" }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: "Hours Reports" }} />
      <Stack.Screen name="HoursByBusiness" component={HoursByBusinessScreen} options={{ title: "Hours by Client" }} />
      <Stack.Screen name="Businesses" component={BusinessesScreen} options={{ title: "Businesses" }} />
    </Stack.Navigator>
  );
}
