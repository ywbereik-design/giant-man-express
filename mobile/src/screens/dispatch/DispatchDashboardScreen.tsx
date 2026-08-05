import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { ChangePasswordCard } from "../../components/ChangePasswordCard";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import type { DispatchStackParamList } from "../../navigation/DispatchNavigator";

type MenuItem = { key: keyof DispatchStackParamList; title: string; subtitle: string };

const ITEMS: MenuItem[] = [
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
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.greeting}>Welcome, {session?.name}</Text>
      <Text style={styles.company}>Giant Man Express &amp; Delivery — Ottawa</Text>
      <Text style={styles.roleNote}>Dispatch access — jobs and driver monitoring only</Text>

      {ITEMS.map((item) => (
        <Pressable key={item.key} style={styles.item} onPress={() => navigation.navigate(item.key as never)}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
        </Pressable>
      ))}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>Account</Text>
        <View style={styles.groupDivider} />
        <ChangePasswordCard />
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  greeting: { color: colors.text, fontSize: 22, fontWeight: "700" },
  company: { color: colors.textMuted, marginBottom: spacing.xs },
  roleNote: { color: colors.info, fontSize: 12, marginBottom: spacing.lg },
  group: { marginTop: spacing.lg },
  groupTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  groupDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: spacing.sm,
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
}
