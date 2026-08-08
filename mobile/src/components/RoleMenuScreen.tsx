import React, { useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { ChangePasswordCard } from "./ChangePasswordCard";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

export interface RoleMenuItem<ParamList extends Record<string, object | undefined>> {
  key: keyof ParamList;
  title: string;
  subtitle: string;
}

export interface RoleMenuGroup<ParamList extends Record<string, object | undefined>> {
  // Omitted for a screen with a single flat list of items (Dispatch,
  // Accountant) — a title/divider only makes sense once there's more than
  // one group to tell apart (Admin).
  title?: string;
  items: RoleMenuItem<ParamList>[];
}

// Shared shell behind the Admin/Dispatch/Accountant dashboards — those three
// screens were otherwise byte-for-byte identical (greeting, optional role
// note, grouped/flat nav items, Account section with the password-change
// card) apart from their own StackParamList and menu contents. Also means
// there's exactly one `navigate(key as never)` cast for the whole app
// instead of one per dashboard — react-navigation has no typed way to
// navigate with a key that isn't a literal, so the cast itself doesn't go
// away, but it's no longer duplicated three times.
export function RoleMenuScreen<ParamList extends Record<string, object | undefined>>({
  navigation,
  roleNote,
  groups,
}: {
  navigation: NativeStackNavigationProp<ParamList, keyof ParamList>;
  roleNote?: string;
  groups: RoleMenuGroup<ParamList>[];
}) {
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.greeting}>Welcome, {session?.name}</Text>
        <Text style={roleNote ? styles.company : styles.companyNoNote}>Giant Man Express &amp; Delivery — Ottawa</Text>
        {roleNote && <Text style={styles.roleNote}>{roleNote}</Text>}

        {groups.map((group, i) => (
          <View key={group.title ?? i} style={group.title ? styles.group : undefined}>
            {group.title && (
              <>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <View style={styles.groupDivider} />
              </>
            )}
            {group.items.map((item) => (
              <Pressable
                key={String(item.key)}
                style={styles.item}
                onPress={() => navigation.navigate(item.key as never)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.subtitle}`}
              >
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              </Pressable>
            ))}
          </View>
        ))}

        <View style={styles.group}>
          <Text style={styles.groupTitle}>Account</Text>
          <View style={styles.groupDivider} />
          <ChangePasswordCard />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    greeting: { color: colors.text, fontSize: 22, fontWeight: "700" },
    company: { color: colors.textMuted, marginBottom: spacing.xs },
    companyNoNote: { color: colors.textMuted, marginBottom: spacing.lg },
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
