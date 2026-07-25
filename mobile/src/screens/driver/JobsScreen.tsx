import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../api/client";
import { FailureReason, Job, JobStatus } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";
import { DriverRouteMap } from "../../components/DriverRouteMap";
import { routeDestination } from "../../lib/routeDestination";
import { capturePhoto } from "../../lib/capturePhoto";
import { getCoords } from "../../lib/getCoords";
import { STATUS_TONE, STAGE_TIMESTAMPS } from "../../lib/jobStatus";
import { CustomerContactButtons } from "../../components/CustomerContactButtons";
import { AddressRow } from "../../components/AddressRow";
import { FailedDeliveryModal } from "../../components/FailedDeliveryModal";
import { enqueueJobUpdate, flushQueuedJobUpdates, getQueuedJobIds } from "../../lib/offlineQueue";
import * as ImagePicker from "expo-image-picker";

const NEXT_ACTION: Partial<Record<JobStatus, { label: string; next: JobStatus }>> = {
  ASSIGNED: { label: "Accept Job", next: "ACCEPTED" },
  ACCEPTED: { label: "Arrived", next: "ARRIVED" },
  ARRIVED: { label: "Picked Up", next: "PICKED_UP" },
  PICKED_UP: { label: "On the Way", next: "ON_THE_WAY" },
  ON_THE_WAY: { label: "Delivered", next: "DELIVERED" },
};

// Photos are required proof at these two specific transitions — mirrors the
// clock-in selfie requirement, but with the rear camera (photo of the
// package/location, not the driver).
const PHOTO_REQUIRED_ON: Partial<Record<JobStatus, true>> = {
  PICKED_UP: true,
  DELIVERED: true,
};

// Statuses a batch action can move several selected jobs into at once — the
// same restriction the backend enforces (see BATCH_ALLOWED_STATUSES),
// mirrored here so the UI never offers a batch action the server would
// reject: PICKED_UP/DELIVERED need a per-job photo, FAILED needs a per-job
// reason, neither has a place in a bulk flow.
const BATCH_ALLOWED_STATUSES: JobStatus[] = ["ACCEPTED", "ARRIVED", "ON_THE_WAY"];
const BATCH_STATUS_LABEL: Partial<Record<JobStatus, string>> = {
  ACCEPTED: "Accepted",
  ARRIVED: "Arrived",
  ON_THE_WAY: "Out for Delivery",
};

// A job can be marked failed from any stage before it's actually delivered —
// mirrors DRIVER_ALLOWED_TRANSITIONS on the backend.
function canFail(status: JobStatus): boolean {
  return status === "ACCEPTED" || status === "ARRIVED" || status === "PICKED_UP" || status === "ON_THE_WAY";
}

interface JobCardProps {
  item: Job;
  selectionMode: boolean;
  selected: boolean;
  isQueued: boolean;
  isUpdating: boolean;
  onToggleSelect: (jobId: string) => void;
  onAdvance: (job: Job) => void;
  onMarkFailed: (job: Job) => void;
}

// Memoized so that a change elsewhere on screen (toggling one other card's
// checkbox, a status update in flight, the offline queue flushing) doesn't
// re-render every card in the list — each one mounts its own MapView (see
// DriverRouteMap) plus decodes two proof-photo images, so an unnecessary
// re-render here is far more expensive than in a typical list row. Relies
// on every prop below being a primitive or a stable (useCallback'd)
// function so React.memo's shallow comparison actually catches "nothing
// relevant to this card changed".
const JobCard = memo(function JobCard({
  item,
  selectionMode,
  selected,
  isQueued,
  isUpdating,
  onToggleSelect,
  onAdvance,
  onMarkFailed,
}: JobCardProps) {
  const action = NEXT_ACTION[item.status];
  const reachedStages = STAGE_TIMESTAMPS.filter((s) => item[s.field]);
  const destination = routeDestination(item);
  const batchEligible = !!action && BATCH_ALLOWED_STATUSES.includes(action.next);

  return (
    <Card>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {selectionMode && batchEligible && (
            <Pressable onPress={() => onToggleSelect(item.id)} hitSlop={8} style={styles.checkbox}>
              <Ionicons
                name={selected ? "checkbox" : "square-outline"}
                size={20}
                color={selected ? colors.primary : colors.textMuted}
              />
            </Pressable>
          )}
          <Badge text={item.jobType.name} />
        </View>
        <Badge text={item.status.replace("_", " ")} tone={STATUS_TONE[item.status]} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      {item.business && <Text style={styles.meta}>Client: {item.business.name}</Text>}
      {item.pickupAddress && <AddressRow label="Pickup: " address={item.pickupAddress} />}
      {item.dropoffStops.map((stop, i) => (
        <AddressRow
          key={stop.id}
          label={item.dropoffStops.length > 1 ? `Stop ${i + 1}: ` : "Dropoff: "}
          address={stop.address}
        />
      ))}
      {item.notes && <Text style={styles.meta}>Notes: {item.notes}</Text>}
      {destination && <DriverRouteMap destinationAddress={destination.address} destinationLabel={destination.label} />}
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
      {item.status === "FAILED" && item.failureReason && <Text style={styles.failureText}>Failed: {item.failureReason}</Text>}
      {item.customerPhone && action && !selectionMode && <CustomerContactButtons phone={item.customerPhone} />}
      {isQueued && <Text style={styles.queuedText}>Queued — will sync automatically once you're online.</Text>}
      {action && !selectionMode && (
        <View style={{ marginTop: spacing.sm }}>
          <Button title={action.label} onPress={() => onAdvance(item)} loading={isUpdating} disabled={isQueued} />
          {canFail(item.status) && (
            <Button
              title="Mark Failed / Undelivered"
              variant="danger"
              onPress={() => onMarkFailed(item)}
              disabled={isQueued || isUpdating}
            />
          )}
        </View>
      )}
    </Card>
  );
});

export function DriverJobsScreen() {
  const tabBarHeight = useDriverTabBarHeight();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [failingJob, setFailingJob] = useState<Job | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ jobs: Job[] }>("/api/driver/jobs");
      setJobs(res.jobs);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load jobs");
    } finally {
      setInitialLoading(false);
    }
    setQueuedIds(getQueuedJobIds());
  }, []);

  const syncQueue = useCallback(async () => {
    await flushQueuedJobUpdates();
    setQueuedIds(getQueuedJobIds());
    await load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      syncQueue();
    }, [syncQueue])
  );

  // Retries queued pickup/delivery updates as soon as the app comes back to
  // the foreground or the device regains connectivity — a driver shouldn't
  // have to remember to pull-to-refresh once they're back in signal.
  useEffect(() => {
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") syncQueue();
    });
    const netInfoSub = NetInfo.addEventListener((state) => {
      if (state.isConnected) syncQueue();
    });
    return () => {
      appStateSub.remove();
      netInfoSub();
    };
  }, [syncQueue]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // useCallback with no deps — this only ever does a functional state
  // update, so its identity can stay stable for the lifetime of the screen,
  // which is what lets JobCard's React.memo actually skip re-rendering
  // every other card when just one checkbox is toggled.
  const toggleSelected = useCallback((jobId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  // The common next status across every currently-selected job, or null if
  // the selection is empty or mixed (no single batch action would apply to
  // all of them).
  const batchNextStatus = useMemo<JobStatus | null>(() => {
    if (selectedIds.size === 0) return null;
    let common: JobStatus | null = null;
    for (const id of selectedIds) {
      const job = jobs.find((j) => j.id === id);
      const next = job ? NEXT_ACTION[job.status]?.next : undefined;
      if (!next || !BATCH_ALLOWED_STATUSES.includes(next)) return null;
      if (common === null) common = next;
      else if (common !== next) return null;
    }
    return common;
  }, [selectedIds, jobs]);

  async function runBatchUpdate() {
    if (!batchNextStatus) return;
    setBatchBusy(true);
    setError(null);
    try {
      const res = await api.patch<{ updatedIds: string[]; skipped: { id: string; reason: string }[] }>(
        "/api/driver/jobs/batch-status",
        { jobIds: Array.from(selectedIds), status: batchNextStatus }
      );
      if (res.skipped.length > 0) {
        setNotice(`${res.updatedIds.length} updated, ${res.skipped.length} skipped (already changed elsewhere).`);
      }
      exitSelectionMode();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the selected jobs");
    } finally {
      setBatchBusy(false);
    }
  }

  // Shared by the normal Accept/Arrived/.../Delivered flow and the offline
  // queue's retry path — sends the status update, and on a network failure
  // (not a rejection) queues it for later instead of surfacing a hard error.
  // useCallback with no deps: every closed-over setter is stable, so this
  // never needs a new identity — which lets `advance` below stay stable too.
  const sendStatusUpdate = useCallback(
    async (
      job: Job,
      status: JobStatus,
      extra: { photo?: string; lat?: number; lng?: number; failureReason?: FailureReason }
    ): Promise<boolean> => {
      try {
        await api.patch(`/api/driver/jobs/${job.id}/status`, { status, ...extra });
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          enqueueJobUpdate({ jobId: job.id, status, ...extra });
          setQueuedIds(getQueuedJobIds());
          setNotice("You're offline — this update is saved and will sync automatically once you're back online.");
          return false;
        }
        throw e;
      }
    },
    []
  );

  // Stable across renders (deps are themselves stable) — passed straight
  // into the memoized JobCard as onAdvance, so tapping one card's action
  // button doesn't invalidate every other card's memo.
  const advance = useCallback(
    async (job: Job) => {
      const action = NEXT_ACTION[job.status];
      if (!action) return;
      setError(null);
      setNotice(null);

      let photo: string | undefined;
      let lat: number | undefined;
      let lng: number | undefined;
      if (PHOTO_REQUIRED_ON[action.next]) {
        try {
          const captured = await capturePhoto(ImagePicker.CameraType.back);
          if (!captured) {
            const label = action.next === "PICKED_UP" ? "pickup" : "delivery";
            setError(`A ${label} photo is required to continue.`);
            return;
          }
          photo = captured;
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not open the camera");
          return;
        }
        // Attached as verification metadata alongside the photo — best
        // effort, a denied/unavailable GPS fix still lets the delivery proceed.
        const { coords } = await getCoords();
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      setUpdatingId(job.id);
      try {
        const sent = await sendStatusUpdate(job, action.next, { photo, lat, lng });
        if (sent) await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not update job");
      } finally {
        setUpdatingId(null);
      }
    },
    [sendStatusUpdate, load]
  );

  const handleMarkFailed = useCallback((job: Job) => setFailingJob(job), []);

  async function submitFailure(reason: FailureReason) {
    const job = failingJob;
    if (!job) return;
    setFailingJob(null);
    setError(null);
    setNotice(null);
    setUpdatingId(job.id);
    try {
      const sent = await sendStatusUpdate(job, "FAILED", { failureReason: reason });
      if (sent) await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not mark this job failed");
    } finally {
      setUpdatingId(null);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  const renderItem = useCallback(
    ({ item }: { item: Job }) => (
      <JobCard
        item={item}
        selectionMode={selectionMode}
        selected={selectedIds.has(item.id)}
        isQueued={queuedIds.has(item.id)}
        isUpdating={updatingId === item.id}
        onToggleSelect={toggleSelected}
        onAdvance={advance}
        onMarkFailed={handleMarkFailed}
      />
    ),
    [selectionMode, selectedIds, queuedIds, updatingId, toggleSelected, advance, handleMarkFailed]
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md + tabBarHeight }}
        data={jobs}
        keyExtractor={(j) => j.id}
        // A driver's list is short (a handful of assigned jobs, not
        // hundreds), so these mainly help by unmounting off-screen cards —
        // each one holds a live MapView + up to two decoded proof photos,
        // which is heavy enough that even a small list benefits from not
        // keeping every row mounted at once.
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => { setLoading(true); await syncQueue(); setLoading(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <ErrorText>{error}</ErrorText>
            {notice && <Text style={styles.notice}>{notice}</Text>}
            <View style={styles.selectionToggleRow}>
              <Pressable onPress={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}>
                <Text style={styles.selectionToggleText}>{selectionMode ? "Cancel Selection" : "Select Multiple"}</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={!error ? <Text style={styles.empty}>No jobs assigned right now.</Text> : null}
        renderItem={renderItem}
      />
      {selectionMode && selectedIds.size > 0 && (
        <View style={[styles.batchBar, { paddingBottom: spacing.md + tabBarHeight }]}>
          {batchNextStatus ? (
            <Button
              title={`Update ${selectedIds.size} to ${BATCH_STATUS_LABEL[batchNextStatus] ?? batchNextStatus}`}
              onPress={runBatchUpdate}
              loading={batchBusy}
            />
          ) : (
            <Text style={styles.batchHint}>Select jobs that share the same next step to update them together.</Text>
          )}
        </View>
      )}
      <FailedDeliveryModal
        visible={!!failingJob}
        onSelect={submitFailure}
        onCancel={() => setFailingJob(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: { padding: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  failureText: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: spacing.xs },
  notice: { color: colors.primary, marginBottom: spacing.md, fontSize: 13 },
  queuedText: { color: colors.primary, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },
  selectionToggleRow: { alignItems: "flex-end", marginBottom: spacing.sm },
  selectionToggleText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  batchBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  batchHint: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
});
