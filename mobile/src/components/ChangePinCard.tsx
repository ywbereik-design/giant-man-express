import React, { useState } from "react";
import { Text, View } from "react-native";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, ErrorText, FieldInput, Label } from "./ui";
import { spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

export function ChangePinCard() {
  const { updateToken } = useAuth();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
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
    if (!currentPin || !newPin) {
      setError("Enter your current and new PIN");
      return;
    }
    if (newPin.length < 4 || newPin.length > 8 || !/^\d+$/.test(newPin)) {
      setError("New PIN must be 4-8 digits, numbers only");
      return;
    }
    if (newPin !== confirmPin) {
      setError("New PIN and confirmation don't match");
      return;
    }
    setSaving(true);
    try {
      // The server bumps this account's tokenVersion on a successful change,
      // which invalidates every previously-issued token — including the one
      // this very request used — so the fresh token it returns must replace
      // the stored one, or the next request would fail as if logged out.
      const res = await api.patch<{ ok: true; token: string }>("/api/account/pin", { currentPin, newPin });
      await updateToken(res.token);
      reset();
      setOpen(false);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change PIN");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <View>
        <Button title="Change PIN" variant="secondary" onPress={toggleOpen} />
        {success && <Text style={{ color: colors.success, marginTop: spacing.sm, fontSize: 13 }}>PIN changed.</Text>}
      </View>
    );
  }

  return (
    <Card>
      <Label>Current PIN</Label>
      <FieldInput value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" />
      <Label>New PIN (4-8 digits)</Label>
      <FieldInput value={newPin} onChangeText={setNewPin} secureTextEntry keyboardType="number-pad" />
      <Label>Confirm New PIN</Label>
      <FieldInput value={confirmPin} onChangeText={setConfirmPin} secureTextEntry keyboardType="number-pad" />
      <ErrorText>{error}</ErrorText>
      <Button title="Save New PIN" onPress={submit} loading={saving} />
      <Button title="Cancel" variant="secondary" onPress={toggleOpen} disabled={saving} />
    </Card>
  );
}
