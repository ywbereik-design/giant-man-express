import React from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RoleMenuScreen, RoleMenuGroup } from "../../components/RoleMenuScreen";
import type { AdminStackParamList } from "../../navigation/AdminNavigator";

const DRIVER_SECTIONS: RoleMenuGroup<AdminStackParamList>["items"] = [
  { key: "Drivers", title: "Drivers", subtitle: "Add drivers, manage codes & PINs" },
];

const DISPATCH_SECTIONS: RoleMenuGroup<AdminStackParamList>["items"] = [
  { key: "Jobs", title: "Jobs & Dispatch", subtitle: "Create and assign jobs, track status" },
  { key: "JobTypes", title: "Job Types", subtitle: "Manage the list of job categories" },
];

const ADMIN_SECTIONS: RoleMenuGroup<AdminStackParamList>["items"] = [
  { key: "Businesses", title: "Businesses", subtitle: "Manage the companies you work with" },
  { key: "Reports", title: "Hours Reports", subtitle: "Generate numbered driver hour reports" },
  { key: "HoursByBusiness", title: "Hours by Client", subtitle: "Driver hours spent per business, for billing reference" },
  { key: "LocationReports", title: "Location Reports", subtitle: "Today's mileage and route per driver" },
  { key: "SelfieReports", title: "Selfie Reports", subtitle: "Every clock-in selfie, by driver and day" },
  { key: "Invoices", title: "Invoices", subtitle: "Generate numbered invoices for clients" },
  { key: "Staff", title: "Staff Accounts", subtitle: "Create admin & dispatch logins" },
];

const GROUPS: RoleMenuGroup<AdminStackParamList>[] = [
  { title: "Driver", items: DRIVER_SECTIONS },
  { title: "Dispatch", items: DISPATCH_SECTIONS },
  { title: "Admin", items: ADMIN_SECTIONS },
];

export function DashboardScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<AdminStackParamList, "Dashboard">;
}) {
  return <RoleMenuScreen navigation={navigation} groups={GROUPS} />;
}
