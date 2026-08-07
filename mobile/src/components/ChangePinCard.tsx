import React from "react";
import { Text, View } from "react-native";
import { Button, Card, ErrorText, FieldInput, Label } from "./ui";
import { spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";
import { useCredentialChangeForm } from "../lib/useCredentialChangeForm";

export function ChangePinCard() {
  const { colors } = useTheme();
  const form = useCredentialChangeForm({
    endpoint: "/api/account/pin",
    buildBody: ({ current, next }) => ({ currentPin: current, newPin: next }),
    validateNext: (next) =>
      next.length < 4 || next.length > 8 || !/^\d+$/.test(next) ? "New PIN must be 4-8 digits, numbers only" : null,
    missingMessage: "Enter your current and new PIN",
    mismatchMessage: "New PIN and confirmation don't match",
    errorFallback: "Could not change PIN",
  });

  if (!form.open) {
    return (
      <View>
        <Button title="Change PIN" variant="secondary" onPress={form.toggleOpen} />
        {form.success && <Text style={{ color: colors.success, marginTop: spacing.sm, fontSize: 13 }}>PIN changed.</Text>}
      </View>
    );
  }

  return (
    <Card>
      <Label>Current PIN</Label>
      <FieldInput value={form.current} onChangeText={form.setCurrent} secureTextEntry keyboardType="number-pad" />
      <Label>New PIN (4-8 digits)</Label>
      <FieldInput value={form.next} onChangeText={form.setNext} secureTextEntry keyboardType="number-pad" />
      <Label>Confirm New PIN</Label>
      <FieldInput value={form.confirm} onChangeText={form.setConfirm} secureTextEntry keyboardType="number-pad" />
      <ErrorText>{form.error}</ErrorText>
      <Button title="Save New PIN" onPress={form.submit} loading={form.saving} />
      <Button title="Cancel" variant="secondary" onPress={form.toggleOpen} disabled={form.saving} />
    </Card>
  );
}
