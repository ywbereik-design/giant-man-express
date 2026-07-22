import React from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { ChangePasswordCard } from "../../components/ChangePasswordCard";
import { colors, spacing } from "../../theme/theme";
import type { AdminStackParamList } from "../../navigation/AdminNavigator";

type MenuItem = { key: keyof AdminStackParamList; title: string; subtitle: string };

const DRIVER_SECTIONS: MenuItem[] = [
  { key: "Drivers", title: "Drivers", subtitle: "Add drivers, manage codes & PINs" },
];

const DISPATCH_SECTIONS: MenuItem[] = [
  { key: "Jobs", title: "Jobs & Dispatch", subtitle: "Create and assign jobs, track status" },
  { key: "JobTypes", title: "Job Types", subtitle: "Manage the list of job categories" },
];

const ADMIN_SECTIONS: MenuItem[] = [
  { key: "Businesses", title: "Businesses", subtitle: "Manage the companies you work with" },
  { key: "Reports", title: "Hours Reports", subtitle: "Generate numbered driver hour reports" },
  { key: "LocationReports", title: "Location Reports", subtitle: "Today's mileage and route per driver" },
  { key: "SelfieReports", title: "Selfie Reports", subtitle: "Every clock-in selfie, by driver and day" },
  { key: "Invoices", title: "Invoices", subtitle: "Generate numbered invoices for clients" },
  { key: "Staff", title: "Staff Accounts", subtitle: "Create admin & dispatch logins" },
];

const GROUPS: { title: string; items: MenuItem[] }[] = [
  { title: "Driver", items: DRIVER_SECTIONS },
  { title: "Dispatch", items: DISPATCH_SECTIONS },
  { title: "Admin", items: ADMIN_SECTIONS },
];

export function DashboardScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<AdminStackParamList, "Dashboard">;
}) {
  const { session } = useAuth();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.greeting}>Welcome, {session?.name}</Text>
      <Text style={styles.company}>Giant Man Express &amp; Delivery — Ottawa</Text>

      {GROUPS.map((group) => (
        <View key={group.title}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {group.items.map((s) => (
            <Pressable key={s.key} style={styles.item} onPress={() => navigation.navigate(s.key as never)}>
              <Text style={styles.itemTitle}>{s.title}</Text>
              <Text style={styles.itemSubtitle}>{s.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      ))}

      <Text style={styles.groupTitle}>Account</Text>
      <ChangePasswordCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  greeting: { color: colors.text, fontSize: 22, fontWeight: "700" },
  company: { color: colors.textMuted, marginBottom: spacing.lg },
  groupTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  itemSubtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
});
