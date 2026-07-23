import React from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { colors, spacing } from "../../theme/theme";
import type { DriverStackParamList } from "../../navigation/DriverNavigator";
import { DriverTabSegmentBar, DriverTabKey } from "../../navigation/DriverTabSegmentBar";

type Action = { tab: "Home" | "Jobs" | "History"; title: string; subtitle: string };

const ACTIONS: Action[] = [
  { tab: "Home", title: "Go to Dashboard / Clock In", subtitle: "Clock in, clock out, and track your shift" },
  { tab: "Jobs", title: "View Assigned Jobs", subtitle: "See and update your delivery jobs" },
  { tab: "History", title: "Check History", subtitle: "Review your past shifts" },
];

export function WelcomeScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<DriverStackParamList, "Welcome">;
}) {
  const { session } = useAuth();

  function goToTab(tab: DriverTabKey) {
    navigation.navigate("Main", { screen: tab });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.topBar}>
        <DriverTabSegmentBar activeTab={null} onSelect={goToTab} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.greeting}>Welcome to Giant Man Express</Text>
        <Text style={styles.name}>Hi, {session?.name}</Text>
        <Text style={styles.role}>Driver</Text>

        {ACTIONS.map((action) => (
          <Pressable
            key={action.tab}
            style={styles.card}
            onPress={() => goToTab(action.tab)}
          >
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardSubtitle}>{action.subtitle}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  greeting: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: spacing.md },
  name: { color: colors.text, fontSize: 16, marginTop: spacing.xs },
  role: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardSubtitle: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
});
