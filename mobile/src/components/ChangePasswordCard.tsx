import React, { useState } from "react";
import { Text, View } from "react-native";
import { api, ApiError } from "../api/client";
import { Button, Card, ErrorText, FieldInput, Label } from "./ui";
import { colors, spacing } from "../theme/theme";

export function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
  }

  function toggleOpen() {
    setOpen((o) => !o);
    reset();
    setSuccess(false);
  }

  async function submit() {
    setError(null);
    setSuccess(false);
    if (!currentPassword || !newPassword) {
      setError("Enter your current and new password");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/api/account/password", { currentPassword, newPassword });
      reset();
      setOpen(false);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <View>
        <Button title="Change Password" variant="secondary" onPress={toggleOpen} />
        {success && <Text style={{ color: colors.success, marginTop: spacing.sm, fontSize: 13 }}>Password changed.</Text>}
      </View>
    );
  }

  return (
    <Card>
      <Label>Current Password</Label>
      <FieldInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Label>New Password (8+ characters)</Label>
      <FieldInput value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Label>Confirm New Password</Label>
      <FieldInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <ErrorText>{error}</ErrorText>
      <Button title="Save New Password" onPress={submit} loading={saving} />
      <Button title="Cancel" variant="secondary" onPress={toggleOpen} />
    </Card>
  );
}
