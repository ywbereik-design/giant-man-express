import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View, StyleSheet, Pressable } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { Button, ErrorText, FieldInput, Label, Screen } from "../components/ui";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { ApiError } from "../api/client";
import { isValidEmail } from "../lib/validation";

type Mode = "ADMIN" | "DISPATCH" | "ACCOUNTANT" | "DRIVER";

const MODES: { id: Mode; label: string; subtitle: string }[] = [
  { id: "ADMIN", label: "Admin", subtitle: "Full system access — settings, reports & invoices" },
  { id: "DISPATCH", label: "Dispatch", subtitle: "View & assign jobs, monitor drivers" },
  { id: "ACCOUNTANT", label: "Accountant", subtitle: "Invoices, hours reports & client billing" },
  { id: "DRIVER", label: "Driver", subtitle: "Clock in/out and manage your assigned jobs" },
];

export function LoginScreen() {
  const { loginAsStaff, loginAsDriver } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mode, setMode] = useState<Mode>("DRIVER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isStaffMode = mode === "ADMIN" || mode === "DISPATCH" || mode === "ACCOUNTANT";
  const activeMode = MODES.find((m) => m.id === mode)!;

  function switchMode(next: Mode) {
    setMode(next);
    setEmail("");
    setPassword("");
    setEmployeeCode("");
    setPin("");
    setError(null);
  }

  async function handleSubmit() {
    setError(null);

    if (isStaffMode) {
      if (!email.trim() || !password) {
        setError("Enter your email and password");
        return;
      }
      if (!isValidEmail(email.trim())) {
        setError("Enter a valid email address");
        return;
      }
    } else {
      if (!employeeCode.trim() || !pin.trim()) {
        setError("Enter your employee code and PIN");
        return;
      }
    }

    setLoading(true);
    try {
      if (isStaffMode) {
        await loginAsStaff(email.trim().toLowerCase(), password);
      } else {
        await loginAsDriver(employeeCode.trim(), pin.trim());
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not connect to the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Screen>
          <View style={styles.brand}>
            <Text style={styles.title}>Giant Man Express</Text>
            <Text style={styles.subtitle}>&amp; Delivery — Ottawa</Text>
          </View>

          <View style={styles.toggleRow}>
            {MODES.map((m) => (
              <Pressable
                key={m.id}
                style={[styles.toggleBtn, mode === m.id && styles.toggleBtnActive]}
                onPress={() => switchMode(m.id)}
              >
                <Text style={[styles.toggleText, mode === m.id && styles.toggleTextActive]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.modeSubtitle}>{activeMode.subtitle}</Text>

          {isStaffMode ? (
            <>
              <Label>Email</Label>
              <FieldInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="name@company.ca"
              />
              <Label>Password</Label>
              <FieldInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="••••••••"
              />
            </>
          ) : (
            <>
              <Label>Employee Code</Label>
              <FieldInput
                value={employeeCode}
                onChangeText={setEmployeeCode}
                autoCapitalize="characters"
                placeholder="e.g. E1024"
              />
              <Label>PIN</Label>
              <FieldInput
                value={pin}
                onChangeText={setPin}
                secureTextEntry
                keyboardType="number-pad"
                placeholder="••••"
              />
            </>
          )}

          <ErrorText>{error}</ErrorText>

          <Button title="Log In" onPress={handleSubmit} loading={loading} />
        </Screen>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  brand: { alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.xl },
  title: { color: colors.primary, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: spacing.sm,
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleText: { color: colors.textMuted, fontWeight: "600" },
  toggleTextActive: { color: colors.primaryText },
  modeSubtitle: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginBottom: spacing.lg },
  });
}
