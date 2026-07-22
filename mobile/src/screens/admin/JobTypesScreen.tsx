import React, { useCallback, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { JobType } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";

export function JobTypesScreen() {
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ jobTypes: JobType[] }>("/api/job-types");
      setJobTypes(res.jobTypes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load job types");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function addJobType() {
    setError(null);
    if (!name.trim()) {
      setError("Enter a job type name");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/job-types", { name: name.trim() });
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add job type");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(jt: JobType) {
    setTogglingId(jt.id);
    try {
      await api.patch(`/api/job-types/${jt.id}`, { active: !jt.active });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update job type");
    } finally {
      setTogglingId(null);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={jobTypes}
      keyExtractor={(j) => j.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Add Job Type</SectionTitle>
          <Card>
            <Label>Name</Label>
            <FieldInput value={name} onChangeText={setName} placeholder="e.g. Cold Chain Delivery" />
            <ErrorText>{error}</ErrorText>
            <Button title="Add Job Type" onPress={addJobType} loading={saving} />
          </Card>
          <SectionTitle>Job Types</SectionTitle>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No job types yet.</Text>}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Badge text={item.active ? "Active" : "Inactive"} tone={item.active ? "success" : "muted"} />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <Button
              title={item.active ? "Deactivate" : "Reactivate"}
              variant="secondary"
              onPress={() => toggleActive(item)}
              loading={togglingId === item.id}
            />
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
});
