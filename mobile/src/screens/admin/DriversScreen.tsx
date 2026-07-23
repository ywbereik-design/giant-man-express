import React, { useCallback, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Driver } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { PhotoThumbnail } from "../../components/PhotoViewer";
import { colors, spacing } from "../../theme/theme";

const JOB_STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  ACCEPTED: "Accepted",
  ARRIVED: "Arrived",
  PICKED_UP: "Picked Up",
  ON_THE_WAY: "On the Way",
};

export function DriversScreen() {
  const { session } = useAuth();
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
    if (!name.trim() || !employeeCode.trim() || pin.trim().length < 4) {
      setError("Name, employee code, and a 4+ digit PIN are required");
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

  async function toggleActive(driver: Driver) {
    setTogglingId(driver.id);
    try {
      await api.patch(`/api/drivers/${driver.id}`, { active: !driver.active });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update driver");
    } finally {
      setTogglingId(null);
    }
  }

  function startEdit(driver: Driver) {
    setEditingId(driver.id);
    setEditName(driver.name);
    setEditPhone(driver.phone ?? "");
    setEditPin("");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(driver: Driver) {
    setEditError(null);
    if (!editName.trim()) {
      setEditError("Name is required");
      return;
    }
    if (editPin && editPin.trim().length < 4) {
      setEditError("New PIN must be at least 4 digits (or leave blank to keep the current PIN)");
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
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
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
      ListEmptyComponent={<Text style={styles.empty}>No drivers yet.</Text>}
      renderItem={({ item }) => {
        if (canManage && editingId === item.id) {
          return (
            <Card>
              <Label>Full Name</Label>
              <FieldInput value={editName} onChangeText={setEditName} />
              <Label>Phone (optional)</Label>
              <FieldInput value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" />
              <Label>Reset PIN (optional — leave blank to keep current)</Label>
              <FieldInput value={editPin} onChangeText={setEditPin} keyboardType="number-pad" secureTextEntry placeholder="New 4+ digit PIN" />
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
                  ? ` · last seen ${new Date(item.currentLocationAt).toLocaleTimeString("en-CA")}`
                  : item.clockedIn
                    ? " · waiting for first location ping"
                    : ""}
              </Text>
            )}
            {item.clockedIn && item.clockInPhoto && (
              <View style={styles.photoRow}>
                <PhotoThumbnail uri={item.clockInPhoto} size={44} />
                <Text style={styles.meta}>
                  Clocked in {item.clockInAt ? new Date(item.clockInAt).toLocaleTimeString("en-CA") : ""}
                </Text>
              </View>
            )}
            {item.clockedIn && !item.clockInPhoto && item.clockInPhotoExpired && (
              <Text style={styles.meta}>Shift photo expired (clocked in over 12h ago)</Text>
            )}
            {canManage && (
              <View style={{ marginTop: spacing.sm, flexDirection: "row", gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button title="Edit" variant="secondary" onPress={() => startEdit(item)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title={item.active ? "Deactivate" : "Reactivate"}
                    variant={item.active ? "danger" : "secondary"}
                    onPress={() => toggleActive(item)}
                    loading={togglingId === item.id}
                  />
                </View>
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
  jobRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
});
