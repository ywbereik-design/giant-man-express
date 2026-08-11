import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Driver, VEHICLE_TYPES, VehicleType } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { PhotoThumbnail } from "../../components/PhotoViewer";
import { isValidPhone, isValidDateOnly } from "../../lib/validation";
import { formatDate, formatTime } from "../../lib/dateRange";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const JOB_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  ARRIVED: "Arrived",
  PICKED_UP: "Picked Up",
  ON_THE_WAY: "On the Way",
};

const VEHICLE_OPTIONS = VEHICLE_TYPES.map((v) => ({ id: v, label: v }));

function isLicenseExpired(expiry: string): boolean {
  return new Date(expiry).getTime() < Date.now();
}

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
  editVehicle,
  editLicenseNumber,
  editLicenseExpiry,
  editLicenseGrade,
  editError,
  editSaving,
  onEditNameChange,
  onEditPhoneChange,
  onEditPinChange,
  onEditVehicleChange,
  onEditLicenseNumberChange,
  onEditLicenseExpiryChange,
  onEditLicenseGradeChange,
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
  editVehicle: string;
  editLicenseNumber: string;
  editLicenseExpiry: string;
  editLicenseGrade: string;
  editError: string | null;
  editSaving: boolean;
  onEditNameChange: (v: string) => void;
  onEditPhoneChange: (v: string) => void;
  onEditPinChange: (v: string) => void;
  onEditVehicleChange: (v: string) => void;
  onEditLicenseNumberChange: (v: string) => void;
  onEditLicenseExpiryChange: (v: string) => void;
  onEditLicenseGradeChange: (v: string) => void;
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
        <FieldInput value={editName} onChangeText={onEditNameChange} accessibilityLabel="Full Name" />
        <Label>Phone (optional)</Label>
        <FieldInput value={editPhone} onChangeText={onEditPhoneChange} keyboardType="phone-pad" accessibilityLabel="Phone" />
        <Label>Reset PIN (optional — leave blank to keep current)</Label>
        <FieldInput
          value={editPin}
          onChangeText={onEditPinChange}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={8}
          placeholder="New 4-8 digit PIN"
          accessibilityLabel="Reset PIN"
        />
        <Label>Assigned Vehicle (optional)</Label>
        <ChipSelect options={VEHICLE_OPTIONS} selectedId={editVehicle || null} onSelect={onEditVehicleChange} />
        <Label>License Number (optional)</Label>
        <FieldInput value={editLicenseNumber} onChangeText={onEditLicenseNumberChange} accessibilityLabel="License Number" />
        <Label>License Expiry (optional, YYYY-MM-DD)</Label>
        <FieldInput
          value={editLicenseExpiry}
          onChangeText={onEditLicenseExpiryChange}
          placeholder="2027-06-30"
          maxLength={10}
          accessibilityLabel="License Expiry"
        />
        <Label>License Grade (optional)</Label>
        <FieldInput
          value={editLicenseGrade}
          onChangeText={onEditLicenseGradeChange}
          placeholder="e.g. G, AZ, DZ"
          accessibilityLabel="License Grade"
        />
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
      {(item.vehicle || item.licenseNumber || item.licenseExpiry || item.licenseGrade) && (
        <View style={styles.jobRow}>
          <Text style={styles.meta}>
            {[
              item.vehicle,
              item.licenseGrade && `License ${item.licenseGrade}`,
              item.licenseNumber,
              item.licenseExpiry && `Expires ${formatDate(item.licenseExpiry)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {item.licenseExpiry && isLicenseExpired(item.licenseExpiry) && <Badge text="License Expired" tone="danger" />}
        </View>
      )}
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
          <PhotoThumbnail uri={item.clockInPhoto} size={44} label="Clock-in selfie" />
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
  const [vehicle, setVehicle] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [licenseGrade, setLicenseGrade] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [editLicenseNumber, setEditLicenseNumber] = useState("");
  const [editLicenseExpiry, setEditLicenseExpiry] = useState("");
  const [editLicenseGrade, setEditLicenseGrade] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ drivers: Driver[]; nextCursor: string | null }>("/api/drivers");
      setDrivers(res.drivers);
      setNextCursor(res.nextCursor);
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

  async function loadMoreDrivers() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get<{ drivers: Driver[]; nextCursor: string | null }>(
        `/api/drivers?cursor=${encodeURIComponent(nextCursor)}`
      );
      setDrivers((prev) => [...prev, ...res.drivers]);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load more drivers");
    } finally {
      setLoadingMore(false);
    }
  }

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
    if (licenseExpiry.trim() && !isValidDateOnly(licenseExpiry.trim())) {
      setError("License expiry must be in YYYY-MM-DD format");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ driver: Driver }>("/api/drivers", {
        name: name.trim(),
        employeeCode: employeeCode.trim(),
        pin: pin.trim(),
        phone: phone.trim() || undefined,
        vehicle: (vehicle as VehicleType) || undefined,
        licenseNumber: licenseNumber.trim() || undefined,
        licenseExpiry: licenseExpiry.trim() || undefined,
        licenseGrade: licenseGrade.trim() || undefined,
      });
      setName("");
      setEmployeeCode("");
      setPin("");
      setPhone("");
      setVehicle("");
      setLicenseNumber("");
      setLicenseExpiry("");
      setLicenseGrade("");
      // Insert locally (re-sorted by name, matching the server's own order)
      // instead of calling load() — a full reload re-fetches only the first
      // page, silently dropping any extra pages already pulled in via "Load
      // More".
      setDrivers((prev) => [...prev, res.driver].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add driver");
    } finally {
      setSaving(false);
    }
  }

  const toggleActive = useCallback(async (driver: Driver) => {
    setTogglingId(driver.id);
    try {
      const res = await api.patch<{ driver: Driver }>(`/api/drivers/${driver.id}`, { active: !driver.active });
      // Merge the patched fields into the existing row instead of calling
      // load() — the PATCH response doesn't include the computed
      // clockedIn/todayDistanceKm/etc. fields a full list fetch does, and a
      // full reload would also reset pagination to the first page.
      setDrivers((prev) => prev.map((d) => (d.id === res.driver.id ? { ...d, ...res.driver } : d)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update driver");
    } finally {
      setTogglingId(null);
    }
  }, []);

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

  const deleteDriver = useCallback(async (driver: Driver) => {
    setDeletingId(driver.id);
    setError(null);
    try {
      await api.delete(`/api/drivers/${driver.id}`);
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id));
    } catch (e) {
      // The backend refuses (409) if this driver has any job/shift/report
      // history — that message ("...deactivate them instead") is exactly
      // what should surface here, not a generic fallback.
      setError(e instanceof ApiError ? e.message : "Could not delete driver");
    } finally {
      setDeletingId(null);
    }
  }, []);

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
    setEditVehicle(driver.vehicle ?? "");
    setEditLicenseNumber(driver.licenseNumber ?? "");
    setEditLicenseExpiry(driver.licenseExpiry ?? "");
    setEditLicenseGrade(driver.licenseGrade ?? "");
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
      if (editLicenseExpiry.trim() && !isValidDateOnly(editLicenseExpiry.trim())) {
        setEditError("License expiry must be in YYYY-MM-DD format");
        return;
      }
      setEditSaving(true);
      try {
        const res = await api.patch<{ driver: Driver }>(`/api/drivers/${driver.id}`, {
          name: editName.trim(),
          phone: editPhone.trim() || undefined,
          ...(editPin.trim() ? { pin: editPin.trim() } : {}),
          vehicle: (editVehicle as VehicleType) || undefined,
          licenseNumber: editLicenseNumber.trim() || undefined,
          licenseExpiry: editLicenseExpiry.trim() || undefined,
          licenseGrade: editLicenseGrade.trim() || undefined,
        });
        setEditingId(null);
        // Merge instead of load() — same reasoning as toggleActive above:
        // preserve the computed fields PATCH doesn't return, and don't reset
        // pagination.
        setDrivers((prev) =>
          prev
            .map((d) => (d.id === res.driver.id ? { ...d, ...res.driver } : d))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch (e) {
        setEditError(e instanceof ApiError ? e.message : "Could not save changes");
      } finally {
        setEditSaving(false);
      }
    },
    [editName, editPhone, editPin, editVehicle, editLicenseNumber, editLicenseExpiry, editLicenseGrade]
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
          editVehicle={isEditing ? editVehicle : ""}
          editLicenseNumber={isEditing ? editLicenseNumber : ""}
          editLicenseExpiry={isEditing ? editLicenseExpiry : ""}
          editLicenseGrade={isEditing ? editLicenseGrade : ""}
          editError={isEditing ? editError : null}
          editSaving={isEditing ? editSaving : false}
          onEditNameChange={setEditName}
          onEditPhoneChange={setEditPhone}
          onEditPinChange={setEditPin}
          onEditVehicleChange={setEditVehicle}
          onEditLicenseNumberChange={setEditLicenseNumber}
          onEditLicenseExpiryChange={setEditLicenseExpiry}
          onEditLicenseGradeChange={setEditLicenseGrade}
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
      editVehicle,
      editLicenseNumber,
      editLicenseExpiry,
      editLicenseGrade,
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
              <FieldInput
                value={employeeCode}
                onChangeText={setEmployeeCode}
                autoCapitalize="characters"
                maxLength={20}
                placeholder="D001"
              />
              <Label>PIN (4-8 digits)</Label>
              <FieldInput
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={8}
                placeholder="1234"
              />
              <Label>Phone (optional)</Label>
              <FieldInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="613-555-0100" />
              <Label>Assigned Vehicle (optional)</Label>
              <ChipSelect options={VEHICLE_OPTIONS} selectedId={vehicle || null} onSelect={setVehicle} />
              <Label>License Number (optional)</Label>
              <FieldInput value={licenseNumber} onChangeText={setLicenseNumber} accessibilityLabel="License Number" />
              <Label>License Expiry (optional, YYYY-MM-DD)</Label>
              <FieldInput
                value={licenseExpiry}
                onChangeText={setLicenseExpiry}
                placeholder="2027-06-30"
                maxLength={10}
                accessibilityLabel="License Expiry"
              />
              <Label>License Grade (optional)</Label>
              <FieldInput
                value={licenseGrade}
                onChangeText={setLicenseGrade}
                placeholder="e.g. G, AZ, DZ"
                accessibilityLabel="License Grade"
              />
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
      ListFooterComponent={
        nextCursor ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Load More" variant="secondary" onPress={loadMoreDrivers} loading={loadingMore} />
          </View>
        ) : null
      }
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
