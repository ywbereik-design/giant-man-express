import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../api/client";
import { Job, JobStatus } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";
import { STATUS_TONE, canFail } from "../../lib/jobStatus";
import { getNextAction, useJobStatusAdvance } from "../../lib/useJobStatusAdvance";
import { JobStageBadges } from "../../components/JobStageBadges";
import { ClientContactButtons } from "../../components/ClientContactButtons";
import { AddressRow } from "../../components/AddressRow";
import { FailedDeliveryModal } from "../../components/FailedDeliveryModal";
import { flushQueuedJobUpdates } from "../../lib/offlineQueue";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { DriverStackParamList } from "../../navigation/DriverNavigator";

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
  const action = getNextAction(item);
  // A job with an update already queued offline is excluded from batch
  // selection — its local status is stale (the queue never optimistically
  // updates `jobs`), so a batch action here could apply a second,
  // conflicting transition on top of the one still waiting to sync. A
  // no-pickup job sitting at ACCEPTED is also excluded — its next action
  // targets ON_THE_WAY via a skip path the batch endpoint doesn't know
  // about (it still only recognizes PICKED_UP -> ON_THE_WAY), so batching
  // it would just come back "skipped"; the single-job action (in the list
  // or on Job Details) handles it correctly instead.
  const batchEligible =
    !!action &&
    BATCH_ALLOWED_STATUSES.includes(action.next) &&
    !isQueued &&
    !(item.status === "ACCEPTED" && !item.pickupAddress);

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
            see JobDetailsScreen.tsx, which also has the full step-by-step
            lifecycle and navigation buttons for a driver who wants to work
            from one screen. Every action here is a shortcut for staying in
            the list instead. */}
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
  }, []);

  // Shared with JobDetailsScreen — same photo-capture/offline-queue logic
  // for advancing a job or marking it failed. This screen just reloads the
  // whole list on every successful update, same as before extraction.
  // useCallback (not an inline closure) so this stays referentially stable
  // across renders — otherwise it'd flow through and give statusAdvance.advance
  // a new identity on every render, defeating renderItem's/JobCard's memoization.
  const onJobUpdated = useCallback(() => {
    load();
  }, [load]);
  const statusAdvance = useJobStatusAdvance(onJobUpdated);

  const syncQueue = useCallback(async () => {
    await flushQueuedJobUpdates();
    statusAdvance.refreshQueuedIds();
    await load();
  }, [load, statusAdvance.refreshQueuedIds]);

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
      const next = job ? getNextAction(job)?.next : undefined;
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
        isQueued={statusAdvance.queuedIds.has(item.id)}
        isUpdating={statusAdvance.updatingId === item.id}
        onToggleSelect={toggleSelected}
        onAdvance={statusAdvance.advance}
        onMarkFailed={statusAdvance.requestMarkFailed}
        onViewDetails={viewDetails}
      />
    ),
    [selectionMode, selectedIds, statusAdvance.queuedIds, statusAdvance.updatingId, toggleSelected, statusAdvance.advance, statusAdvance.requestMarkFailed, viewDetails]
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
            <ErrorText>{error ?? statusAdvance.error}</ErrorText>
            {(notice ?? statusAdvance.notice) && <Text style={styles.notice}>{notice ?? statusAdvance.notice}</Text>}
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
        visible={!!statusAdvance.failingJob}
        onSelect={statusAdvance.submitFailure}
        onCancel={statusAdvance.cancelMarkFailed}
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
