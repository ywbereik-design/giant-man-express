import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.xs, textTransform: "uppercase" },
    input: {
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      borderRadius: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 16,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    button: {
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.sm,
    },
    buttonText: { fontSize: 16, fontWeight: "600" },
    error: { color: colors.danger, marginBottom: spacing.md },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
    badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
    sectionTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: spacing.md },
    centeredSpinner: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: spacing.xl * 2 },
  });
}

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

export function Screen({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.screen}>{children}</View>;
}

export function Card({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.card}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.label}>{children}</Text>;
}

export function FieldInput(props: TextInputProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />;
}

interface ButtonProps extends PressableProps {
  title: string;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}

export function Button({ title, variant = "primary", loading, disabled, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const bg =
    variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : colors.surfaceAlt;
  // Danger buttons always get white text regardless of theme — colors.text
  // flips to near-black in light mode, and near-black-on-red reads muddy
  // and fails contrast; white stays legible against `danger` in both modes.
  const textColor = variant === "primary" ? colors.primaryText : variant === "danger" ? "#FFFFFF" : colors.text;
  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: pressed || disabled ? 0.7 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children: string | null }) {
  const styles = useStyles();
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Badge({ text, tone = "info" }: { text: string; tone?: "info" | "success" | "danger" | "muted" }) {
  const { colors } = useTheme();
  const styles = useStyles();
  // "muted" uses a dedicated mutedBadgeBg, not `border` — border is a
  // near-background near-white in light mode, which made this badge's
  // (always-white) text effectively invisible there.
  const bg =
    tone === "success" ? colors.success : tone === "danger" ? colors.danger : tone === "muted" ? colors.mutedBadgeBg : colors.info;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

// Full-space centered spinner for a screen's first load, so we never flash an
// "empty" state before we actually know whether there's data or not.
export function CenteredSpinner() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.centeredSpinner}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
