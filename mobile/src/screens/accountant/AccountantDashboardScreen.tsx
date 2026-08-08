import React from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RoleMenuScreen, RoleMenuGroup } from "../../components/RoleMenuScreen";
import type { AccountantStackParamList } from "../../navigation/AccountantNavigator";

const ITEMS: RoleMenuGroup<AccountantStackParamList>["items"] = [
  { key: "Invoices", title: "Invoices", subtitle: "Generate numbered invoices for clients" },
  { key: "Reports", title: "Hours Reports", subtitle: "Generate numbered driver hour reports" },
  { key: "HoursByBusiness", title: "Hours by Client", subtitle: "Driver hours spent per business, for billing reference" },
  { key: "Businesses", title: "Businesses", subtitle: "Manage clients and their billing rates" },
];

export function AccountantDashboardScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<AccountantStackParamList, "Dashboard">;
}) {
  return (
    <RoleMenuScreen
      navigation={navigation}
      roleNote="Accountant access — invoices, reports & client billing only"
      groups={[{ items: ITEMS }]}
    />
  );
}
