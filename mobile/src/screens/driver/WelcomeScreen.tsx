import React, { useMemo } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import type { DriverStackParamList } from "../../navigation/DriverNavigator";
import { DriverTabSegmentBar, DriverTabKey } from "../../navigation/DriverTabSegmentBar";

export function WelcomeScreen({
  navigation,
}: {
  navigation: NativeStackNavigationProp<DriverStackParamList, "Welcome">;
}) {
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  function goToTab(tab: DriverTabKey) {
    navigation.navigate("Main", { screen: tab });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.topBar}>
        <DriverTabSegmentBar activeTab={null} onSelect={goToTab} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Welcome to Giant Man Express</Text>
        <Text style={styles.name}>Hi, {session?.name}</Text>
        <Text style={styles.role}>Driver</Text>

        <View style={styles.illustrationWrap}>
          <View style={styles.illustrationBadge}>
            <FontAwesome5 name="truck" size={72} color={colors.primary} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    content: { flexGrow: 1, padding: spacing.md },
    greeting: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: spacing.md },
    name: { color: colors.text, fontSize: 16, marginTop: spacing.xs },
    role: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
    illustrationWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: spacing.xl },
    illustrationBadge: {
      width: 176,
      height: 176,
      borderRadius: 88,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
