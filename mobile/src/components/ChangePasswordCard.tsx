import React from "react";
import { Text, View } from "react-native";
import { Button, Card, ErrorText, FieldInput, Label } from "./ui";
import { spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { useCredentialChangeForm } from "../lib/useCredentialChangeForm";

export function ChangePasswordCard() {
  const { colors } = useTheme();
  const form = useCredentialChangeForm({
    endpoint: "/api/account/password",
    buildBody: ({ current, next }) => ({ currentPassword: current, newPassword: next }),
    validateNext: (next) => (next.length < 8 ? "New password must be at least 8 characters" : null),
    missingMessage: "Enter your current and new password",
    mismatchMessage: "New password and confirmation don't match",
    errorFallback: "Could not change password",
  });

  if (!form.open) {
    return (
      <View>
        <Button title="Change Password" variant="secondary" onPress={form.toggleOpen} />
        {form.success && <Text style={{ color: colors.success, marginTop: spacing.sm, fontSize: 13 }}>Password changed.</Text>}
      </View>
    );
  }

  return (
    <Card>
      <Label>Current Password</Label>
      <FieldInput value={form.current} onChangeText={form.setCurrent} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Label>New Password (8+ characters)</Label>
      <FieldInput value={form.next} onChangeText={form.setNext} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Label>Confirm New Password</Label>
      <FieldInput value={form.confirm} onChangeText={form.setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <ErrorText>{form.error}</ErrorText>
      <Button title="Save New Password" onPress={form.submit} loading={form.saving} />
      <Button title="Cancel" variant="secondary" onPress={form.toggleOpen} disabled={form.saving} />
    </Card>
  );
}
