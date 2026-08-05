import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { ChangePasswordCard } from "../../components/ChangePasswordCard";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import type { AccountantStackParamList } from "../../navigation/AccountantNavigator";

type MenuItem = { key: keyof AccountantStackParamList; title: string; subtitle: string };

const ITEMS: MenuItem[] = [
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
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.greeting}>Welcome, {session?.name}</Text>
      <Text style={styles.company}>Giant Man Express &amp; Delivery — Ottawa</Text>
      <Text style={styles.roleNote}>Accountant access — invoices, reports & client billing only</Text>

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
