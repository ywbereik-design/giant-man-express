import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../api/client";
import { FailureReason, Job, JobStatus } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";
import { capturePhoto } from "../../lib/capturePhoto";
import { getCoords } from "../../lib/getCoords";
import { IN_PROGRESS_STATUSES, STATUS_TONE } from "../../lib/jobStatus";
import { JobStageBadges } from "../../components/JobStageBadges";
import { ClientContactButtons } from "../../components/ClientContactButtons";
import { AddressRow } from "../../components/AddressRow";
import { FailedDeliveryModal } from "../../components/FailedDeliveryModal";
import { flushQueuedJobUpdates, getQueuedJobIds } from "../../lib/offlineQueue";
import { submitJobStatus } from "../../lib/submitJobStatus";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { DriverStackParamList } from "../../navigation/DriverNavigator";

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

// A pickup photo only makes sense as proof against an actual pickup
// location — if dispatch never set one on the job, there's nothing to
// prove a pickup happened at, so the driver can advance straight through
// without the camera prompt. Delivery photos stay unconditionally required
// (every job has at least one dropoff stop). Mirrors the backend's own
// conditional check in /api/driver/jobs/[id]/status.
function isPhotoRequired(nextStatus: JobStatus, job: Job): boolean {
  if (nextStatus === "PICKED_UP") return Boolean(job.pickupAddress);
  return Boolean(PHOTO_REQUIRED_ON[nextStatus]);
}

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
  return IN_PROGRESS_STATUSES.includes(status);
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
  onViewDetails: (job: Job) => void;
}

// Memoized so that a change elsewhere on screen (toggling one other card's
// checkbox, a status update in flight, the offline queue flushing) doesn't
// re-render every card in the list. Relies on every prop below being a
// primitive or a stable (useCallback'd) function so React.memo's shallow
// comparison actually catches "nothing relevant to this card changed".
const JobCard = memo(function JobCard({
  item,
  selectionMode,
  selected,
  isQueued,
  isUpdating,
  onToggleSelect,
  onAdvance,
  onMarkFailed,
  onViewDetails,
}: JobCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const action = NEXT_ACTION[item.status];
  // A job with an update already queued offline is excluded from batch
  // selection — its local status is stale (the queue never optimistically
  // updates `jobs`), so a batch action here could apply a second,
  // conflicting transition on top of the one still waiting to sync.
  const batchEligible = !!action && BATCH_ALLOWED_STATUSES.includes(action.next) && !isQueued;

  return (
    <Pressable onPress={selectionMode ? undefined : () => onViewDetails(item)}>
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            {selectionMode && batchEligible && (
              <Pressable
                onPress={() => onToggleSelect(item.id)}
                hitSlop={8}
                style={styles.checkbox}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Select ${item.title} for batch update`}
              >
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
        <JobStageBadges job={item} />
        {item.status === "FAILED" && item.failureReason && <Text style={styles.failureText}>Failed: {item.failureReason}</Text>}
        {item.clientPhone && action && !selectionMode && <ClientContactButtons phone={item.clientPhone} />}
        {isQueued && <Text style={styles.queuedText}>Queued — will sync automatically once you're online.</Text>}
        {/* Accepting a job only happens on the Job Details screen now (via
            the swipe-to-accept gesture there), not from a plain button here —
            see JobDetailsScreen.tsx. Navigation buttons live there too, next
            to the pickup/dropoff addresses. Every other in-progress action
            stays on the card. */}
        {action && item.status !== "ASSIGNED" && !selectionMode && (
          <View style={{ marginTop: spacing.sm }}>
            <Button
              title={action.label}
              onPress={() => onAdvance(item)}
              loading={isUpdating}
              disabled={isQueued}
              variant="secondary"
            />
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
        {item.status === "ASSIGNED" && !selectionMode && (
          <Text style={styles.tapHint}>Tap to view details and accept this job</Text>
        )}
      </Card>
    </Pressable>
  );
});

export function DriverJobsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabBarHeight = useDriverTabBarHeight();
  // Jobs lives inside the bottom-tab navigator (Main), so JobDetails — a
  // sibling of Main, not nested inside it — is reached via the parent
  // stack, the same pattern DriverTopTabBar's own back button already uses.
  const navigation = useNavigation();
  const viewDetails = useCallback(
    (job: Job) => navigation.getParent<NativeStackNavigationProp<DriverStackParamList>>()?.navigate("JobDetails", { job }),
    [navigation]
  );
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
  // queue's retry path — delegates the actual send/queue decision to
  // submitJobStatus (shared with JobDetailsScreen's swipe-to-accept) and
  // just layers this screen's own UI feedback (the "you're offline" notice,
  // refreshing queuedIds) on top. useCallback with no deps: every closed-
  // over setter is stable, so this never needs a new identity — which lets
  // `advance` below stay stable too.
  const sendStatusUpdate = useCallback(
    async (
      job: Job,
      status: JobStatus,
      extra: { photo?: string; lat?: number; lng?: number; failureReason?: FailureReason }
    ): Promise<boolean> => {
      const result = await submitJobStatus(job.id, status, extra);
      if (!result.sent) {
        setQueuedIds(getQueuedJobIds());
        setNotice("You're offline — this update is saved and will sync automatically once you're back online.");
      }
      return result.sent;
    },
    []
  );

  // Holds a just-captured photo/coords across a failed submit attempt so a
  // retry doesn't force the driver back through the camera — capturePhoto()
  // is slow enough on its own (a real photo, resized/compressed at up to 3
  // quality steps) that discarding it on every transient submit error (a
  // slow connection, a 409 from another device having already moved the
  // job on) and forcing a full recapture was the actual "delay, then need
  // to take another photo" complaint. Keyed by job+target status so it's
  // never reused for the wrong job or a since-changed transition; cleared
  // once the attempt is actually handed off (sent live or queued offline).
  const pendingCaptureRef = useRef<{
    jobId: string;
    nextStatus: JobStatus;
    photo?: string;
    lat?: number;
    lng?: number;
  } | null>(null);

  // Stable across renders (deps are themselves stable) — passed straight
  // into the memoized JobCard as onAdvance, so tapping one card's action
  // button doesn't invalidate every other card's memo.
  const advance = useCallback(
    async (job: Job) => {
      const action = NEXT_ACTION[job.status];
      if (!action) return;
      // Set before the (possibly slow) camera capture below, not after —
      // isUpdating disables this job's action button once this is set, so a
      // fast double-tap while the camera modal is still opening would
      // otherwise fire a second concurrent submission for the same job.
      setUpdatingId(job.id);
      setError(null);
      setNotice(null);

      try {
        let photo: string | undefined;
        let lat: number | undefined;
        let lng: number | undefined;

        const pending = pendingCaptureRef.current;
        const reusable = pending && pending.jobId === job.id && pending.nextStatus === action.next;

        if (reusable) {
          photo = pending.photo;
          lat = pending.lat;
          lng = pending.lng;
        } else if (isPhotoRequired(action.next, job)) {
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
          pendingCaptureRef.current = { jobId: job.id, nextStatus: action.next, photo, lat, lng };
        }

        const sent = await sendStatusUpdate(job, action.next, { photo, lat, lng });
        // Handed off either way (sent live, or handed to the offline queue) —
        // nothing left to retry with this same captured photo.
        pendingCaptureRef.current = null;
        if (sent) await load();
      } catch (e) {
        // Deliberately NOT clearing pendingCaptureRef here — see the comment
        // above it. Tapping the action again will resubmit with this same
        // photo instead of reopening the camera.
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

  // Must run on every render, including the initialLoading one below — a
  // hook called only after that early return fires on some renders and not
  // others, which is exactly what triggered "Rendered more hooks than
  // during the previous render" (React requires every hook to run
  // unconditionally, in the same order, on every render of a component).
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
        onViewDetails={viewDetails}
      />
    ),
    [selectionMode, selectedIds, queuedIds, updatingId, toggleSelected, advance, handleMarkFailed, viewDetails]
  );

  if (initialLoading) return <CenteredSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md + tabBarHeight }}
        data={jobs}
        keyExtractor={(j) => j.id}
        // A driver's list is short (a handful of assigned jobs, not
        // hundreds), so these mainly help by unmounting off-screen cards —
        // each one can hold up to two decoded proof photos, which is heavy
        // enough that even a small list benefits from not keeping every
        // row mounted at once.
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
              <Pressable
                onPress={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                accessibilityRole="button"
                accessibilityLabel={selectionMode ? "Cancel Selection" : "Select Multiple"}
              >
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

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: { padding: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  failureText: { color: colors.danger, fontSize: 13, fontWeight: "600", marginTop: spacing.xs },
  notice: { color: colors.primary, marginBottom: spacing.md, fontSize: 13 },
  queuedText: { color: colors.primary, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },
  tapHint: { color: colors.primary, fontSize: 13, fontWeight: "600", marginTop: spacing.sm },
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
}
