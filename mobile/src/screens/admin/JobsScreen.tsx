import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Image, Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business, Driver, Job, JobType } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { colors, spacing } from "../../theme/theme";

const STATUS_TONE: Record<Job["status"], "info" | "success" | "danger" | "muted"> = {
  ASSIGNED: "info",
  ACCEPTED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "muted",
};

const FILTERS = [
  { id: "ACTIVE", label: "Active" },
  { id: "ALL", label: "All" },
  { id: "COMPLETED", label: "Completed" },
  { id: "CANCELLED", label: "Cancelled" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

export function AdminJobsScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [driverOptions, setDriverOptions] = useState<Driver[]>([]);
  const [jobTypeOptions, setJobTypeOptions] = useState<JobType[]>([]);
  const [businessOptions, setBusinessOptions] = useState<Business[]>([]);
  const [filter, setFilter] = useState<FilterId>("ACTIVE");

  const [title, setTitle] = useState("");
  const [jobTypeId, setJobTypeId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [jobsRes, driversRes, typesRes, businessesRes] = await Promise.all([
        api.get<{ jobs: Job[] }>("/api/jobs"),
        api.get<{ drivers: Driver[] }>("/api/drivers"),
        api.get<{ jobTypes: JobType[] }>("/api/job-types"),
        api.get<{ businesses: Business[] }>("/api/businesses"),
      ]);
      setJobs(jobsRes.jobs);
      setDriverOptions(driversRes.drivers.filter((d) => d.active));
      setJobTypeOptions(typesRes.jobTypes.filter((t) => t.active));
      setBusinessOptions(businessesRes.businesses);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load dispatch data");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visibleJobs = useMemo(() => {
    if (filter === "ALL") return jobs;
    if (filter === "ACTIVE") return jobs.filter((j) => j.status === "ASSIGNED" || j.status === "ACCEPTED" || j.status === "IN_PROGRESS");
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  async function createJob() {
    setError(null);
    if (!title.trim() || !jobTypeId || !driverId) {
      setError("Title, job type, and driver are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/jobs", {
        title: title.trim(),
        jobTypeId,
        driverId,
        businessId: businessId ?? undefined,
        pickupAddress: pickupAddress.trim() || undefined,
        dropoffAddress: dropoffAddress.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setTitle("");
      setJobTypeId(null);
      setDriverId(null);
      setBusinessId(null);
      setPickupAddress("");
      setDropoffAddress("");
      setNotes("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create job");
    } finally {
      setSaving(false);
    }
  }

  function confirmCancelJob(job: Job) {
    Alert.alert("Cancel this job?", `"${job.title}" will be marked as cancelled. This can't be undone.`, [
      { text: "Keep Job", style: "cancel" },
      { text: "Cancel Job", style: "destructive", onPress: () => cancelJob(job) },
    ]);
  }

  async function cancelJob(job: Job) {
    setCancellingId(job.id);
    setError(null);
    try {
      await api.patch(`/api/jobs/${job.id}`, { status: "CANCELLED" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel job");
    } finally {
      setCancellingId(null);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <>
    <FlatList
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      data={visibleJobs}
      keyExtractor={(j) => j.id}
      ListHeaderComponent={
        <View>
          <SectionTitle>Dispatch a Job</SectionTitle>
          <Card>
            <Label>Title</Label>
            <FieldInput value={title} onChangeText={setTitle} placeholder="Delivery to warehouse" />

            <Label>Job Type</Label>
            <ChipSelect
              options={jobTypeOptions.map((t) => ({ id: t.id, label: t.name }))}
              selectedId={jobTypeId}
              onSelect={setJobTypeId}
            />

            <Label>Driver</Label>
            <ChipSelect
              options={driverOptions.map((d) => ({ id: d.id, label: d.name }))}
              selectedId={driverId}
              onSelect={setDriverId}
            />

            <Label>Business / Client (optional)</Label>
            <ChipSelect
              options={businessOptions.map((b) => ({ id: b.id, label: b.name }))}
              selectedId={businessId}
              onSelect={(id) => setBusinessId(id === businessId ? null : id)}
            />

            <Label>Pickup Address (optional)</Label>
            <FieldInput value={pickupAddress} onChangeText={setPickupAddress} placeholder="123 Depot Rd" />
            <Label>Dropoff Address (optional)</Label>
            <FieldInput value={dropoffAddress} onChangeText={setDropoffAddress} placeholder="456 Client Ave" />
            <Label>Notes (optional)</Label>
            <FieldInput value={notes} onChangeText={setNotes} placeholder="Gate code, contact, etc." />

            <ErrorText>{error}</ErrorText>
            <Button title="Assign Job" onPress={createJob} loading={saving} />
          </Card>
          <SectionTitle>Jobs</SectionTitle>
          <ChipSelect
            options={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
            selectedId={filter}
            onSelect={(id) => setFilter(id as FilterId)}
          />
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No jobs in this view.</Text>}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.headerRow}>
            <Badge text={item.jobType.name} />
            <Badge text={item.status.replace("_", " ")} tone={STATUS_TONE[item.status]} />
          </View>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>Driver: {item.driver?.name ?? "—"}</Text>
          {item.business && <Text style={styles.meta}>Client: {item.business.name}</Text>}
          {item.arrivedAt && (
            <Text style={styles.meta}>Arrived: {new Date(item.arrivedAt).toLocaleString("en-CA")}</Text>
          )}
          {item.arrivalPhoto && (
            <Pressable onPress={() => setViewingPhoto(item.arrivalPhoto)} style={{ marginTop: spacing.sm }}>
              <Image source={{ uri: item.arrivalPhoto }} style={styles.thumbnail} />
            </Pressable>
          )}
          {item.status !== "COMPLETED" && item.status !== "CANCELLED" && (
            <View style={{ marginTop: spacing.sm }}>
              <Button
                title="Cancel Job"
                variant="danger"
                onPress={() => confirmCancelJob(item)}
                loading={cancellingId === item.id}
              />
            </View>
          )}
        </Card>
      )}
    />
    <Modal visible={!!viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(null)}>
      <Pressable style={styles.viewerBackdrop} onPress={() => setViewingPhoto(null)}>
        {viewingPhoto && <Image source={{ uri: viewingPhoto }} style={styles.viewerImage} resizeMode="contain" />}
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  thumbnail: { width: 80, height: 80, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: { width: "100%", height: "80%" },
});
