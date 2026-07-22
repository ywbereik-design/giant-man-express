import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { StaffAccount, StaffRole } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { colors, spacing } from "../../theme/theme";

const ROLE_OPTIONS: { id: StaffRole; label: string }[] = [
  { id: "ADMIN", label: "Admin" },
  { id: "DISPATCH", label: "Dispatch" },
];

export function StaffScreen() {
  const { session } = useAuth();
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("DISPATCH");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<StaffRole>("DISPATCH");
  const [editPassword, setEditPassword] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ staff: StaffAccount[] }>("/api/staff");
      setStaff(res.staff);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load staff accounts");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addStaff() {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/staff", { name: name.trim(), email: email.trim(), password, role });
      setName("");
      setEmail("");
      setPassword("");
      setRole("DISPATCH");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add staff account");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(member: StaffAccount) {
    setEditingId(member.id);
    setEditRole(member.role);
    setEditPassword("");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(member: StaffAccount) {
    setEditError(null);
    if (editPassword && editPassword.length < 8) {
      setEditError("New password must be at least 8 characters (or leave blank to keep the current one)");
      return;
    }
    setEditSaving(true);
    try {
      await api.patch(`/api/staff/${member.id}`, {
        role: editRole,
        ...(editPassword ? { password: editPassword } : {}),
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "Could not save changes");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(member: StaffAccount) {
    setError(null);
    setBusyId(member.id);
    try {
      await api.patch(`/api/staff/${member.id}`, { active: !member.active });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update account");
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(member: StaffAccount) {
    Alert.alert(
      "Delete this account?",
      `"${member.name}" (${member.email}) will be permanently deleted. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteStaff(member) },
      ]
    );
  }

  async function deleteStaff(member: StaffAccount) {
    setError(null);
    setBusyId(member.id);
    try {
      await api.delete(`/api/staff/${member.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete account");
    } finally {
      setBusyId(null);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={staff}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Add Staff Account</SectionTitle>
          <Card>
            <Label>Full Name</Label>
            <FieldInput value={name} onChangeText={setName} placeholder="Jane Dispatcher" />
            <Label>Email</Label>
            <FieldInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="dispatch2@giantmanexpress.ca" />
            <Label>Temporary Password (8+ characters)</Label>
            <FieldInput value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
            <Label>Role</Label>
            <ChipSelect options={ROLE_OPTIONS} selectedId={role} onSelect={(id) => setRole(id as StaffRole)} />
            <ErrorText>{error}</ErrorText>
            <Button title="Add Staff Account" onPress={addStaff} loading={saving} />
          </Card>
          <SectionTitle>Staff Accounts</SectionTitle>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No staff accounts yet.</Text>}
      renderItem={({ item }) => {
        const isSelf = item.id === session?.id;

        if (editingId === item.id) {
          return (
            <Card>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.email}</Text>
              <Label>Role</Label>
              <ChipSelect options={ROLE_OPTIONS} selectedId={editRole} onSelect={(id) => setEditRole(id as StaffRole)} />
              <Label>Reset Password (optional — leave blank to keep current)</Label>
              <FieldInput value={editPassword} onChangeText={setEditPassword} secureTextEntry placeholder="New password" />
              <ErrorText>{editError}</ErrorText>
              <Button title="Save Changes" onPress={() => saveEdit(item)} loading={editSaving} />
              <Button title="Cancel" variant="secondary" onPress={cancelEdit} />
            </Card>
          );
        }
        return (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {item.name}
                  {isSelf ? " (you)" : ""}
                </Text>
                <Text style={styles.meta}>{item.email}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
                <Badge text={item.role === "ADMIN" ? "Admin" : "Dispatch"} tone={item.role === "ADMIN" ? "info" : "muted"} />
                <Badge text={item.active ? "Active" : "Inactive"} tone={item.active ? "success" : "muted"} />
              </View>
            </View>
            <View style={{ marginTop: spacing.sm, flexDirection: "row", gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Edit" variant="secondary" onPress={() => startEdit(item)} />
              </View>
              {!isSelf && (
                <View style={{ flex: 1 }}>
                  <Button
                    title={item.active ? "Deactivate" : "Reactivate"}
                    variant={item.active ? "danger" : "secondary"}
                    onPress={() => toggleActive(item)}
                    loading={busyId === item.id}
                  />
                </View>
              )}
            </View>
            {!isSelf && (
              <View style={{ marginTop: spacing.sm }}>
                <Button title="Delete Account" variant="danger" onPress={() => confirmDelete(item)} loading={busyId === item.id} />
              </View>
            )}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
});
