import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { JobType } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

// Memoized so typing in the "Add Job Type" form above the list doesn't
// re-render every existing job type card on every keystroke.
const JobTypeRow = memo(function JobTypeRow({
  item,
  isToggling,
  onToggleActive,
}: {
  item: JobType;
  isToggling: boolean;
  onToggleActive: (jt: JobType) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.name}>{item.name}</Text>
        <Badge text={item.active ? "Active" : "Inactive"} tone={item.active ? "success" : "muted"} />
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <Button
          title={item.active ? "Deactivate" : "Reactivate"}
          variant={item.active ? "danger" : "secondary"}
          onPress={() => onToggleActive(item)}
          loading={isToggling}
        />
      </View>
    </Card>
  );
});

export function JobTypesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const toggleActive = useCallback(
    async (jt: JobType) => {
      setTogglingId(jt.id);
      try {
        await api.patch(`/api/job-types/${jt.id}`, { active: !jt.active });
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not update job type");
      } finally {
        setTogglingId(null);
      }
    },
    [load]
  );

  // Only the deactivating direction needs a confirmation — reactivating just
  // makes it selectable again and isn't destructive.
  const confirmToggleActive = useCallback(
    (jt: JobType) => {
      if (!jt.active) {
        toggleActive(jt);
        return;
      }
      Alert.alert("Deactivate this job type?", `"${jt.name}" will no longer be selectable for new jobs.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => toggleActive(jt) },
      ]);
    },
    [toggleActive]
  );

  const renderItem = useCallback(
    ({ item }: { item: JobType }) => <JobTypeRow item={item} isToggling={togglingId === item.id} onToggleActive={confirmToggleActive} />,
    [togglingId, confirmToggleActive]
  );

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
      ListEmptyComponent={!error ? <Text style={styles.empty}>No job types yet.</Text> : null}
      renderItem={renderItem}
    />
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  name: { color: colors.text, fontSize: 16, fontWeight: "700" },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  });
}
