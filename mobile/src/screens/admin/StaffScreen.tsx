import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { StaffAccount, StaffRole } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { isValidEmail } from "../../lib/validation";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const ROLE_OPTIONS: { id: StaffRole; label: string }[] = [
  { id: "ADMIN", label: "Admin" },
  { id: "DISPATCH", label: "Dispatch" },
  { id: "ACCOUNTANT", label: "Accountant" },
];

const ROLE_LABEL: Record<StaffRole, string> = { ADMIN: "Admin", DISPATCH: "Dispatch", ACCOUNTANT: "Accountant" };
const ROLE_TONE: Record<StaffRole, "info" | "muted"> = { ADMIN: "info", DISPATCH: "muted", ACCOUNTANT: "muted" };

// Memoized so typing in the "Add Staff Account" form above the list doesn't
// re-render every existing account card on every keystroke. Edit-mode
// fields are normalized to constant values for rows not being edited (see
// renderItem below) so memo's shallow prop compare still bails for them
// while a different row's edit form is being typed into.
const StaffRow = memo(function StaffRow({
  item,
  isSelf,
  isEditing,
  isBusy,
  editRole,
  editPassword,
  editError,
  editSaving,
  onEditRoleChange,
  onEditPasswordChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onDelete,
}: {
  item: StaffAccount;
  isSelf: boolean;
  isEditing: boolean;
  isBusy: boolean;
  editRole: StaffRole;
  editPassword: string;
  editError: string | null;
  editSaving: boolean;
  onEditRoleChange: (role: StaffRole) => void;
  onEditPasswordChange: (v: string) => void;
  onStartEdit: (member: StaffAccount) => void;
  onCancelEdit: () => void;
  onSaveEdit: (member: StaffAccount) => void;
  onToggleActive: (member: StaffAccount) => void;
  onDelete: (member: StaffAccount) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (isEditing) {
    return (
      <Card>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.meta}>{item.email}</Text>
        <Label>Role</Label>
        <ChipSelect options={ROLE_OPTIONS} selectedId={editRole} onSelect={(id) => onEditRoleChange(id as StaffRole)} />
        <Label>Reset Password (optional — leave blank to keep current)</Label>
        <FieldInput value={editPassword} onChangeText={onEditPasswordChange} secureTextEntry placeholder="New password" />
        <ErrorText>{editError}</ErrorText>
        <Button title="Save Changes" onPress={() => onSaveEdit(item)} loading={editSaving} />
        <Button title="Cancel" variant="secondary" onPress={onCancelEdit} />
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
          <Badge text={ROLE_LABEL[item.role]} tone={ROLE_TONE[item.role]} />
          <Badge text={item.active ? "Active" : "Inactive"} tone={item.active ? "success" : "muted"} />
        </View>
      </View>
      <View style={{ marginTop: spacing.sm, flexDirection: "row", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Edit" variant="secondary" onPress={() => onStartEdit(item)} />
        </View>
        {!isSelf && (
          <View style={{ flex: 1 }}>
            <Button
              title={item.active ? "Deactivate" : "Reactivate"}
              variant={item.active ? "danger" : "secondary"}
              onPress={() => onToggleActive(item)}
              loading={isBusy}
            />
          </View>
        )}
      </View>
      {!isSelf && (
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Delete Account" variant="danger" onPress={() => onDelete(item)} loading={isBusy} />
        </View>
      )}
    </Card>
  );
});

export function StaffScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    if (!isValidEmail(email.trim())) {
      setError("Enter a valid email address");
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

  const startEdit = useCallback((member: StaffAccount) => {
    setEditingId(member.id);
    setEditRole(member.role);
    setEditPassword("");
    setEditError(null);
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback(
    async (member: StaffAccount) => {
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
    },
    [editRole, editPassword, load]
  );

  const toggleActive = useCallback(
    async (member: StaffAccount) => {
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
    },
    [load]
  );

  // Only the deactivating direction needs a confirmation — reactivating just
  // restores access and isn't destructive.
  const confirmToggleActive = useCallback(
    (member: StaffAccount) => {
      if (!member.active) {
        toggleActive(member);
        return;
      }
      Alert.alert("Deactivate this account?", `"${member.name}" (${member.email}) will no longer be able to log in.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => toggleActive(member) },
      ]);
    },
    [toggleActive]
  );

  const deleteStaff = useCallback(
    async (member: StaffAccount) => {
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
    },
    [load]
  );

  const confirmDelete = useCallback(
    (member: StaffAccount) => {
      Alert.alert(
        "Delete this account?",
        `"${member.name}" (${member.email}) will be permanently deleted. This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteStaff(member) },
        ]
      );
    },
    [deleteStaff]
  );

  const renderItem = useCallback(
    ({ item }: { item: StaffAccount }) => {
      const isEditing = editingId === item.id;
      return (
        <StaffRow
          item={item}
          isSelf={item.id === session?.id}
          isEditing={isEditing}
          isBusy={busyId === item.id}
          editRole={isEditing ? editRole : "DISPATCH"}
          editPassword={isEditing ? editPassword : ""}
          editError={isEditing ? editError : null}
          editSaving={isEditing ? editSaving : false}
          onEditRoleChange={setEditRole}
          onEditPasswordChange={setEditPassword}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
          onToggleActive={confirmToggleActive}
          onDelete={confirmDelete}
        />
      );
    },
    [session?.id, editingId, busyId, editRole, editPassword, editError, editSaving, startEdit, cancelEdit, saveEdit, confirmToggleActive, confirmDelete]
  );

  if (initialLoading) return <CenteredSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
      ListEmptyComponent={!error ? <Text style={styles.empty}>No staff accounts yet.</Text> : null}
      renderItem={renderItem}
    />
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  });
}
