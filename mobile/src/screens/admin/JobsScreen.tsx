import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Business, Driver, Job, JobType } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText, FieldInput, Label, SectionTitle } from "../../components/ui";
import { ChipSelect } from "../../components/ChipSelect";
import { AddressAutocompleteInput } from "../../components/AddressAutocompleteInput";
import { PhotoThumbnail } from "../../components/PhotoViewer";
import { AddressRow } from "../../components/AddressRow";
import { STATUS_TONE, STAGE_TIMESTAMPS, photoCaption } from "../../lib/jobStatus";
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
      await api.post("/api/jobs", {
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
      renderItem={({ item }) => {
        const reachedStages = STAGE_TIMESTAMPS.filter((s) => item[s.field]);
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
            {reachedStages.length > 0 && (
              <View style={styles.stageRow}>
                {reachedStages.map((s) => (
                  <Badge
                    key={s.field}
                    text={`${s.label} ${new Date(item[s.field] as string).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}`}
                    tone="muted"
                  />
                ))}
              </View>
            )}
            {item.status === "FAILED" && item.failureReason && (
              <Text style={styles.failureText}>Failed: {item.failureReason}</Text>
            )}
            {(item.pickupPhoto || item.deliveryPhoto) && (
              <View style={styles.photoRow}>
                {item.pickupPhoto && (
                  <View style={styles.photoCol}>
                    <Text style={styles.photoLabel}>Pickup</Text>
                    <PhotoThumbnail
                      uri={item.pickupPhoto}
                      caption={photoCaption(item.pickupLat, item.pickupLng, item.pickedUpAt)}
                    />
                  </View>
                )}
                {item.deliveryPhoto && (
                  <View style={styles.photoCol}>
                    <Text style={styles.photoLabel}>Delivery</Text>
                    <PhotoThumbnail
                      uri={item.deliveryPhoto}
                      caption={photoCaption(item.deliveryLat, item.deliveryLng, item.deliveredAt)}
                    />
                  </View>
                )}
              </View>
            )}
            {item.status !== "DELIVERED" && item.status !== "CANCELLED" && item.status !== "FAILED" && (
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
        );
      }}
    />
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
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  });
}
