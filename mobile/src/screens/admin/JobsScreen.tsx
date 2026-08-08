import React, { memo, useCallback, useMemo, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business, Driver, Job, JobType } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { AddressAutocompleteInput } from "../../components/AddressAutocompleteInput";
import { PhotoThumbnail } from "../../components/PhotoViewer";
import { AddressRow } from "../../components/AddressRow";
import { STATUS_TONE, photoCaption } from "../../lib/jobStatus";
import { JobStageBadges } from "../../components/JobStageBadges";
import { isValidPhone } from "../../lib/validation";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";

const FILTERS = [
  { id: "ACTIVE", label: "Active" },
  { id: "ALL", label: "All" },
  { id: "DELIVERED", label: "Delivered" },
  { id: "FAILED", label: "Failed" },
  { id: "CANCELLED", label: "Cancelled" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

const ACTIVE_STATUSES: Job["status"][] = ["ASSIGNED", "ACCEPTED", "ARRIVED", "PICKED_UP", "ON_THE_WAY"];

// Memoized and given its own useTheme()/styles rather than receiving them as
// props — this is the FlatList renderItem's row, so on a long job list an
// unmemoized version re-renders every single card on every keystroke in the
// create-job form above it (the form's state lives in the parent, and an
// inline renderItem closure is a new function every render regardless).
// React.memo only pays off if every prop below is itself stable across
// unrelated parent re-renders — see the useCallback'd onCancel and the
// primitive isCancelling passed from AdminJobsScreen.
const JobRow = memo(function JobRow({
  item,
  isCancelling,
  onCancel,
}: {
  item: Job;
  isCancelling: boolean;
  onCancel: (job: Job) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Pickup/delivery photos are deliberately excluded from GET /api/jobs's
  // list response (a page of up to 200 jobs with both photos could be
  // hundreds of MB — see JOB_LIST_SELECT on the backend) and fetched here
  // on demand instead, one job at a time, only when actually opened.
  type PhotoState = { pickupPhoto: string | null; pickupLat: number | null; pickupLng: number | null; deliveryPhoto: string | null; deliveryLat: number | null; deliveryLng: number | null };
  const [photos, setPhotos] = useState<PhotoState | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState<"pickup" | "delivery" | null>(null);

  const mayHavePhotos = item.status !== "ASSIGNED" && item.status !== "ACCEPTED" && item.status !== "ARRIVED";

  async function loadPhotos() {
    setLoadingPhotos(true);
    setPhotosError(null);
    try {
      const res = await api.get<{ job: Job }>(`/api/jobs/${item.id}`);
      setPhotos({
        pickupPhoto: res.job.pickupPhoto ?? null,
        pickupLat: res.job.pickupLat ?? null,
        pickupLng: res.job.pickupLng ?? null,
        deliveryPhoto: res.job.deliveryPhoto ?? null,
        deliveryLat: res.job.deliveryLat ?? null,
        deliveryLng: res.job.deliveryLng ?? null,
      });
    } catch (e) {
      setPhotosError(e instanceof ApiError ? e.message : "Could not load photos");
    } finally {
      setLoadingPhotos(false);
    }
  }

  async function deletePhoto(type: "pickup" | "delivery") {
    setDeletingType(type);
    setPhotosError(null);
    try {
      await api.delete(`/api/jobs/${item.id}/photo?type=${type}`);
      setPhotos((prev) => (prev ? { ...prev, [type === "pickup" ? "pickupPhoto" : "deliveryPhoto"]: null } : prev));
    } catch (e) {
      setPhotosError(e instanceof ApiError ? e.message : "Could not delete photo");
    } finally {
      setDeletingType(null);
    }
  }

  function confirmDeletePhoto(type: "pickup" | "delivery") {
    Alert.alert(`Delete this ${type} photo?`, "The job's status and timestamps stay — only the photo is removed. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deletePhoto(type) },
    ]);
  }

  return (
    <Card>
      <View style={styles.headerRow}>
        <Badge text={item.jobType.name} />
        <Badge text={item.status.replace("_", " ")} tone={STATUS_TONE[item.status]} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.meta}>Driver: {item.driver?.name ?? "—"}</Text>
      {item.business && <Text style={styles.meta}>Client: {item.business.name}</Text>}
      {item.pickupAddress && <AddressRow label="Pickup: " address={item.pickupAddress} />}
      {item.dropoffStops.map((stop, i) => (
        <AddressRow
          key={stop.id}
          label={item.dropoffStops.length > 1 ? `Stop ${i + 1}: ` : "Dropoff: "}
          address={stop.address}
        />
      ))}
      <JobStageBadges job={item} />
      {item.status === "FAILED" && item.failureReason && (
        <Text style={styles.failureText}>Failed: {item.failureReason}</Text>
      )}
      {mayHavePhotos && (
        <View style={{ marginTop: spacing.sm }}>
          {!photos && <Button title="View Photos" variant="secondary" onPress={loadPhotos} loading={loadingPhotos} />}
          <ErrorText>{photosError}</ErrorText>
          {photos && !photos.pickupPhoto && !photos.deliveryPhoto && (
            <Text style={styles.meta}>No photos on file for this job.</Text>
          )}
          {photos && (photos.pickupPhoto || photos.deliveryPhoto) && (
            <View style={styles.photoRow}>
              {photos.pickupPhoto && (
                <View style={styles.photoCol}>
                  <Text style={styles.photoLabel}>Pickup</Text>
                  <PhotoThumbnail
                    uri={photos.pickupPhoto}
                    caption={photoCaption(photos.pickupLat, photos.pickupLng, item.pickedUpAt)}
                    label="Pickup photo"
                  />
                  <Button title="Delete" variant="danger" onPress={() => confirmDeletePhoto("pickup")} loading={deletingType === "pickup"} />
                </View>
              )}
              {photos.deliveryPhoto && (
                <View style={styles.photoCol}>
                  <Text style={styles.photoLabel}>Delivery</Text>
                  <PhotoThumbnail
                    uri={photos.deliveryPhoto}
                    caption={photoCaption(photos.deliveryLat, photos.deliveryLng, item.deliveredAt)}
                    label="Delivery photo"
                  />
                  <Button title="Delete" variant="danger" onPress={() => confirmDeletePhoto("delivery")} loading={deletingType === "delivery"} />
                </View>
              )}
            </View>
          )}
        </View>
      )}
      {item.status !== "DELIVERED" && item.status !== "CANCELLED" && item.status !== "FAILED" && (
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Cancel Job" variant="danger" onPress={() => onCancel(item)} loading={isCancelling} />
        </View>
      )}
    </Card>
  );
});

export function AdminJobsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const [dropoffAddresses, setDropoffAddresses] = useState<string[]>([""]);
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [jobsRes, driversRes, typesRes, businessesRes] = await Promise.all([
        api.get<{ jobs: Job[]; nextCursor: string | null }>("/api/jobs"),
        api.get<{ drivers: Driver[] }>("/api/drivers"),
        api.get<{ jobTypes: JobType[] }>("/api/job-types"),
        api.get<{ businesses: Business[] }>("/api/businesses"),
      ]);
      setJobs(jobsRes.jobs);
      setNextCursor(jobsRes.nextCursor);
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

  async function loadMoreJobs() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get<{ jobs: Job[]; nextCursor: string | null }>(
        `/api/jobs?cursor=${encodeURIComponent(nextCursor)}`
      );
      setJobs((prev) => [...prev, ...res.jobs]);
      setNextCursor(res.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load more jobs");
    } finally {
      setLoadingMore(false);
    }
  }

  const visibleJobs = useMemo(() => {
    if (filter === "ALL") return jobs;
    if (filter === "ACTIVE") return jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  function updateDropoffAt(index: number, value: string) {
    setDropoffAddresses((prev) => prev.map((a, i) => (i === index ? value : a)));
  }

  function addDropoffField() {
    setDropoffAddresses((prev) => [...prev, ""]);
  }

  function removeDropoffField(index: number) {
    setDropoffAddresses((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [""]));
  }

  // Picking a business fills in its stored address and phone — most jobs
  // are picked up from the client's own premises and their contact number
  // is who the driver should reach at the address, so this saves
  // re-typing details dispatch already has on file. Only fills an empty
  // field, so it never clobbers something the dispatcher already typed
  // (e.g. a different pickup point/contact than the client's own).
  function selectBusiness(id: string) {
    if (id === businessId) {
      setBusinessId(null);
      return;
    }
    setBusinessId(id);
    const business = businessOptions.find((b) => b.id === id);
    if (business?.address && !pickupAddress.trim()) {
      setPickupAddress(business.address);
    }
    if (business?.phone && !clientPhone.trim()) {
      setClientPhone(business.phone);
    }
  }

  async function createJob() {
    setError(null);
    if (!title.trim() || !jobTypeId || !driverId) {
      setError("Title, job type, and driver are required");
      return;
    }
    if (clientPhone.trim() && !isValidPhone(clientPhone.trim())) {
      setError("Enter a valid client phone number, or leave it blank");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post<{ job: Job }>("/api/jobs", {
        title: title.trim(),
        jobTypeId,
        driverId,
        businessId: businessId ?? undefined,
        pickupAddress: pickupAddress.trim() || undefined,
        dropoffAddresses: dropoffAddresses.map((a) => a.trim()).filter(Boolean),
        clientPhone: clientPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setTitle("");
      setJobTypeId(null);
      setDriverId(null);
      setBusinessId(null);
      setPickupAddress("");
      setDropoffAddresses([""]);
      setClientPhone("");
      setNotes("");
      // Prepend locally instead of calling load() — GET /api/jobs orders
      // newest-first, so this matches server order exactly, and unlike a
      // full reload it doesn't discard any additional pages already pulled
      // in via "Load More".
      setJobs((prev) => [res.job, ...prev]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create job");
    } finally {
      setSaving(false);
    }
  }

  const cancelJob = useCallback(async (job: Job) => {
    setCancellingId(job.id);
    setError(null);
    try {
      const res = await api.patch<{ job: Job }>(`/api/jobs/${job.id}`, { status: "CANCELLED" });
      // Patch this one row locally instead of calling load() — a full
      // reload re-fetches only the first page, silently dropping any extra
      // pages already pulled in via "Load More".
      setJobs((prev) => prev.map((j) => (j.id === res.job.id ? res.job : j)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not cancel job");
    } finally {
      setCancellingId(null);
    }
  }, []);

  const confirmCancelJob = useCallback(
    (job: Job) => {
      Alert.alert("Cancel this job?", `"${job.title}" will be marked as cancelled. This can't be undone.`, [
        { text: "Keep Job", style: "cancel" },
        { text: "Cancel Job", style: "destructive", onPress: () => cancelJob(job) },
      ]);
    },
    [cancelJob]
  );

  const renderItem = useCallback(
    ({ item }: { item: Job }) => <JobRow item={item} isCancelling={cancellingId === item.id} onCancel={confirmCancelJob} />,
    [cancellingId, confirmCancelJob]
  );

  if (initialLoading) return <CenteredSpinner />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
              onSelect={selectBusiness}
            />

            <Label>Pickup Address (optional)</Label>
            <AddressAutocompleteInput value={pickupAddress} onChangeText={setPickupAddress} placeholder="123 Depot Rd" />

            <Label>Delivery Stops (optional)</Label>
            {dropoffAddresses.map((address, index) => (
              <View key={index} style={styles.stopRow}>
                <View style={{ flex: 1 }}>
                  <AddressAutocompleteInput
                    value={address}
                    onChangeText={(v) => updateDropoffAt(index, v)}
                    placeholder={dropoffAddresses.length > 1 ? `Stop ${index + 1} — 456 Client Ave` : "456 Client Ave"}
                  />
                </View>
                {(dropoffAddresses.length > 1 || address.length > 0) && (
                  <Pressable onPress={() => removeDropoffField(index)} style={styles.removeStop} hitSlop={8}>
                    <Text style={styles.removeStopText}>Remove</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Button title="+ Add Delivery Stop" variant="secondary" onPress={addDropoffField} />

            <Label>Client Phone (optional)</Label>
            <FieldInput
              value={clientPhone}
              onChangeText={setClientPhone}
              placeholder="+1 555 555 5555"
              keyboardType="phone-pad"
            />

            <Label>Notes (optional)</Label>
            <FieldInput value={notes} onChangeText={setNotes} placeholder="Gate code, contact, etc." />

            <ErrorText>{error}</ErrorText>
            <Button title="Assign Job" onPress={createJob} loading={saving} />
          </Card>
          <View style={styles.divider} />
          <SectionTitle>Jobs</SectionTitle>
          <ChipSelect
            options={FILTERS.map((f) => ({ id: f.id, label: f.label }))}
            selectedId={filter}
            onSelect={(id) => setFilter(id as FilterId)}
          />
        </View>
      }
      ListEmptyComponent={!error ? <Text style={styles.empty}>No jobs in this view.</Text> : null}
      ListFooterComponent={
        nextCursor ? (
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Load More" variant="secondary" onPress={loadMoreJobs} loading={loadingMore} />
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.lg },
  stopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  removeStop: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  removeStopText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  failureText: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: spacing.xs },
  photoRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  photoCol: { alignItems: "flex-start" },
  photoLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.lg, marginBottom: spacing.md },
  });
}
