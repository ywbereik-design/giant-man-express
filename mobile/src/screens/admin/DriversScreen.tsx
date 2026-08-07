import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Driver } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { PhotoThumbnail } from "../../components/PhotoViewer";
import { isValidPhone } from "../../lib/validation";
import { formatTime } from "../../lib/dateRange";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const JOB_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  ARRIVED: "Arrived",
  PICKED_UP: "Picked Up",
  ON_THE_WAY: "On the Way",
};

// Memoized so typing in the "Add Driver" form above the list (a separate
// piece of state in the parent) doesn't re-render every existing driver
// card on every keystroke — an inline renderItem closure did that
// regardless of which state changed. Edit-mode fields are normalized to
// constant values for rows that aren't being edited (see renderItem below)
// so memo's shallow prop compare still bails out for them even while a
// different row's edit form is being typed into.
const DriverRow = memo(function DriverRow({
  item,
  canManage,
  isEditing,
  isToggling,
  isDeleting,
  editName,
  editPhone,
  editPin,
  editError,
  editSaving,
  onEditNameChange,
  onEditPhoneChange,
  onEditPinChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleActive,
  onDelete,
}: {
  item: Driver;
  canManage: boolean;
  isEditing: boolean;
  isToggling: boolean;
  isDeleting: boolean;
  editName: string;
  editPhone: string;
  editPin: string;
  editError: string | null;
  editSaving: boolean;
  onEditNameChange: (v: string) => void;
  onEditPhoneChange: (v: string) => void;
  onEditPinChange: (v: string) => void;
  onStartEdit: (driver: Driver) => void;
  onCancelEdit: () => void;
  onSaveEdit: (driver: Driver) => void;
  onToggleActive: (driver: Driver) => void;
  onDelete: (driver: Driver) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (canManage && isEditing) {
    return (
      <Card>
        <Label>Full Name</Label>
        <FieldInput value={editName} onChangeText={onEditNameChange} />
        <Label>Phone (optional)</Label>
        <FieldInput value={editPhone} onChangeText={onEditPhoneChange} keyboardType="phone-pad" />
        <Label>Reset PIN (optional — leave blank to keep current)</Label>
        <FieldInput value={editPin} onChangeText={onEditPinChange} keyboardType="number-pad" secureTextEntry placeholder="New 4+ digit PIN" />
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
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            Code: {item.employeeCode}
            {item.phone ? ` · ${item.phone}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
          <Badge text={item.active ? "Active" : "Inactive"} tone={item.active ? "success" : "muted"} />
          {item.active && (
            <Badge text={item.clockedIn ? "Clocked In" : "Clocked Out"} tone={item.clockedIn ? "success" : "muted"} />
          )}
        </View>
      </View>
      {item.active && item.currentJobStatus && (
        <View style={styles.jobRow}>
          <Badge
            text={JOB_STATUS_LABEL[item.currentJobStatus] ?? item.currentJobStatus}
            tone={item.currentJobStatus === "ASSIGNED" ? "muted" : "info"}
          />
          <Text style={styles.meta} numberOfLines={1}>
            {item.currentJobTitle}
          </Text>
        </View>
      )}
      {item.active && ((item.todayDistanceKm ?? 0) > 0 || item.clockedIn) && (
        <Text style={styles.meta}>
          Today: {(item.todayDistanceKm ?? 0).toFixed(1)} km
          {item.clockedIn && item.currentLocationAt
            ? ` · last seen ${formatTime(item.currentLocationAt)}`
            : item.clockedIn
              ? " · waiting for first location ping"
              : ""}
        </Text>
      )}
      {item.clockedIn && item.clockInPhoto && (
        <View style={styles.photoRow}>
          <PhotoThumbnail uri={item.clockInPhoto} size={44} />
          <Text style={styles.meta}>Clocked in {item.clockInAt ? formatTime(item.clockInAt) : ""}</Text>
        </View>
      )}
      {item.clockedIn && !item.clockInPhoto && item.clockInPhotoExpired && (
        <Text style={styles.meta}>Shift photo expired (clocked in over 12h ago)</Text>
      )}
      {canManage && (
        <View style={{ marginTop: spacing.sm, flexDirection: "row", gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Edit" variant="secondary" onPress={() => onStartEdit(item)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title={item.active ? "Deactivate" : "Reactivate"}
              variant={item.active ? "danger" : "secondary"}
              onPress={() => onToggleActive(item)}
              loading={isToggling}
            />
          </View>
        </View>
      )}
      {canManage && (
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Delete Driver" variant="danger" onPress={() => onDelete(item)} loading={isDeleting} />
        </View>
      )}
    </Card>
  );
});

export function DriversScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const canManage = session?.role === "ADMIN";

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ drivers: Driver[] }>("/api/drivers");
      setDrivers(res.drivers);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load drivers");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addDriver() {
    setError(null);
    if (!name.trim() || !employeeCode.trim()) {
      setError("Name and employee code are required");
      return;
    }
    if (pin.trim().length < 4 || pin.trim().length > 8 || !/^\d+$/.test(pin.trim())) {
      setError("PIN must be 4-8 digits, numbers only");
      return;
    }
    if (phone.trim() && !isValidPhone(phone.trim())) {
      setError("Enter a valid phone number");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/drivers", {
        name: name.trim(),
        employeeCode: employeeCode.trim(),
        pin: pin.trim(),
        phone: phone.trim() || undefined,
      });
      setName("");
      setEmployeeCode("");
      setPin("");
      setPhone("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add driver");
    } finally {
      setSaving(false);
    }
  }

  const toggleActive = useCallback(
    async (driver: Driver) => {
      setTogglingId(driver.id);
      try {
        await api.patch(`/api/drivers/${driver.id}`, { active: !driver.active });
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not update driver");
      } finally {
        setTogglingId(null);
      }
    },
    [load]
  );

  // Only the deactivating direction needs a confirmation — reactivating just
  // restores access and isn't destructive.
  const confirmToggleActive = useCallback(
    (driver: Driver) => {
      if (!driver.active) {
        toggleActive(driver);
        return;
      }
      Alert.alert("Deactivate this driver?", `${driver.name} will no longer be assignable to jobs.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => toggleActive(driver) },
      ]);
    },
    [toggleActive]
  );

  const deleteDriver = useCallback(
    async (driver: Driver) => {
      setDeletingId(driver.id);
      setError(null);
      try {
        await api.delete(`/api/drivers/${driver.id}`);
        await load();
      } catch (e) {
        // The backend refuses (409) if this driver has any job/shift/report
        // history — that message ("...deactivate them instead") is exactly
        // what should surface here, not a generic fallback.
        setError(e instanceof ApiError ? e.message : "Could not delete driver");
      } finally {
        setDeletingId(null);
      }
    },
    [load]
  );

  const confirmDeleteDriver = useCallback(
    (driver: Driver) => {
      Alert.alert(
        "Delete this driver?",
        `"${driver.name}" will be permanently deleted. This only works if they have no job or shift history — otherwise, deactivate instead.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteDriver(driver) },
        ]
      );
    },
    [deleteDriver]
  );

  const startEdit = useCallback((driver: Driver) => {
    setEditingId(driver.id);
    setEditName(driver.name);
    setEditPhone(driver.phone ?? "");
    setEditPin("");
    setEditError(null);
  }, []);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback(
    async (driver: Driver) => {
      setEditError(null);
      if (!editName.trim()) {
        setEditError("Name is required");
        return;
      }
      if (editPin && (editPin.trim().length < 4 || editPin.trim().length > 8 || !/^\d+$/.test(editPin.trim()))) {
        setEditError("New PIN must be 4-8 digits, numbers only (or leave blank to keep the current PIN)");
        return;
      }
      if (editPhone.trim() && !isValidPhone(editPhone.trim())) {
        setEditError("Enter a valid phone number");
        return;
      }
      setEditSaving(true);
      try {
        await api.patch(`/api/drivers/${driver.id}`, {
          name: editName.trim(),
          phone: editPhone.trim() || undefined,
          ...(editPin.trim() ? { pin: editPin.trim() } : {}),
        });
        setEditingId(null);
        await load();
      } catch (e) {
        setEditError(e instanceof ApiError ? e.message : "Could not save changes");
      } finally {
        setEditSaving(false);
      }
    },
    [editName, editPhone, editPin, load]
  );

  const renderItem = useCallback(
    ({ item }: { item: Driver }) => {
      const isEditing = canManage && editingId === item.id;
      return (
        <DriverRow
          item={item}
          canManage={canManage}
          isEditing={isEditing}
          isToggling={togglingId === item.id}
          isDeleting={deletingId === item.id}
          editName={isEditing ? editName : ""}
          editPhone={isEditing ? editPhone : ""}
          editPin={isEditing ? editPin : ""}
          editError={isEditing ? editError : null}
          editSaving={isEditing ? editSaving : false}
          onEditNameChange={setEditName}
          onEditPhoneChange={setEditPhone}
          onEditPinChange={setEditPin}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
          onToggleActive={confirmToggleActive}
          onDelete={confirmDeleteDriver}
        />
      );
    },
    [
      canManage,
      editingId,
      togglingId,
      deletingId,
      editName,
      editPhone,
      editPin,
      editError,
      editSaving,
      startEdit,
      cancelEdit,
      saveEdit,
      confirmToggleActive,
      confirmDeleteDriver,
    ]
  );

  if (initialLoading) return <CenteredSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={drivers}
      keyExtractor={(d) => d.id}
      ListHeaderComponent={
        canManage ? (
          <View>
            <SectionTitle>Add Driver</SectionTitle>
            <Card>
              <Label>Full Name</Label>
              <FieldInput value={name} onChangeText={setName} placeholder="Jasdeep Singh" />
              <Label>Employee Code</Label>
              <FieldInput value={employeeCode} onChangeText={setEmployeeCode} autoCapitalize="characters" placeholder="D001" />
              <Label>PIN (4+ digits)</Label>
              <FieldInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry placeholder="1234" />
              <Label>Phone (optional)</Label>
              <FieldInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="613-555-0100" />
              <ErrorText>{error}</ErrorText>
              <Button title="Add Driver" onPress={addDriver} loading={saving} />
            </Card>
            <SectionTitle>Drivers</SectionTitle>
          </View>
        ) : (
          <SectionTitle>Drivers</SectionTitle>
        )
      }
      ListEmptyComponent={!error ? <Text style={styles.empty}>No drivers yet.</Text> : null}
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
  jobRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  });
}
