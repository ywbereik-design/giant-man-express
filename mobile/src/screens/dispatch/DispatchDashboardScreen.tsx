import React from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RoleMenuScreen, RoleMenuGroup } from "../../components/RoleMenuScreen";
import type { DispatchStackParamList } from "../../navigation/DispatchNavigator";

const ITEMS: RoleMenuGroup<DispatchStackParamList>["items"] = [
  { key: "Jobs", title: "Jobs & Dispatch", subtitle: "Create and assign jobs, track status" },
  { key: "Drivers", title: "Drivers", subtitle: "Monitor who's active and currently clocked in" },
  { key: "LocationReports", title: "Live Map", subtitle: "See where drivers are and their route" },
  { key: "SelfieReports", title: "Selfie Reports", subtitle: "Every clock-in selfie, by driver and day" },
];

export function DispatchDashboardScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<DispatchStackParamList, "Dashboard">;
}) {
  return (
    <RoleMenuScreen
      navigation={navigation}
      roleNote="Dispatch access — jobs and driver monitoring only"
      groups={[{ items: ITEMS }]}
    />
  );
}
