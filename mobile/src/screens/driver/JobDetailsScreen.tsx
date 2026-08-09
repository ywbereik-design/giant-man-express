import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError } from "../../api/client";
import { Job } from "../../api/types";
import { Badge, Button, Card, ErrorText } from "../../components/ui";
import { AddressRow } from "../../components/AddressRow";
import { ClientContactButtons } from "../../components/ClientContactButtons";
import { SwipeToAccept } from "../../components/SwipeToAccept";
import { FailedDeliveryModal } from "../../components/FailedDeliveryModal";
import { openNavigationTo } from "../../lib/openInMaps";
import { submitJobStatus } from "../../lib/submitJobStatus";
import { getNextAction, useJobStatusAdvance } from "../../lib/useJobStatusAdvance";
import { STATUS_TONE, getLifecycleSteps, canFail, hasReachedAnyStage } from "../../lib/jobStatus";
import { JobStageBadges } from "../../components/JobStageBadges";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import type { DriverStackParamList } from "../../navigation/DriverNavigator";

type Props = NativeStackScreenProps<DriverStackParamList, "JobDetails">;

// A vertical progress list of the post-acceptance stages — lets a driver
// see at a glance which one they're on and what's left, instead of only
// knowing the single next action. Hidden entirely for ASSIGNED (not yet
// accepted — getLifecycleSteps starts at ACCEPTED) and FAILED/CANCELLED (a
// terminal state with nothing left to step through). Only 2 stages show for
// a job with no pickup address — see getLifecycleSteps.
function LifecycleStepper({ job }: { job: Job }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStepperStyles(colors), [colors]);
  const steps = getLifecycleSteps(job);
  const currentIndex = steps.findIndex((s) => s.status === job.status);
  if (currentIndex === -1) return null;

  return (
    <View>
      {steps.map((step, i) => {
        // DELIVERED is both steps' last entry and a terminal status — once
        // reached there's nothing left "in progress", so it
        // reads as done rather than active.
        const done = i < currentIndex || (job.status === "DELIVERED" && i === currentIndex);
        const active = !done && i === currentIndex;
        return (
          <View key={step.status} style={styles.row}>
            <Ionicons
              name={done ? "checkmark-circle" : active ? "radio-button-on" : "ellipse-outline"}
              size={20}
              color={done ? colors.success : active ? colors.primary : colors.textMuted}
            />
            <Text style={[styles.label, done && styles.labelDone, active && styles.labelActive]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Reached by tapping a job card in the list ("click to view") — the single
// place a driver reviews a job's full details and drives it through its
// entire lifecycle: accepting (via the swipe gesture), every status
// advance, marking it failed, and navigating to the pickup/dropoff
// addresses, all without leaving this screen. The job list still has its
// own copy of the same advance/mark-failed actions (see JobsScreen.tsx) as
// a shortcut for drivers who'd rather not open each job — both share the
// same underlying logic via useJobStatusAdvance so they can't drift apart.
export function JobDetailsScreen({ route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [job, setJob] = useState(route.params.job);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // useCallback so this stays referentially stable across renders — setJob
  // itself is already stable, so this never needs to change identity.
  const onJobUpdated = useCallback((updated: Job) => setJob(updated), []);
  const statusAdvance = useJobStatusAdvance(onJobUpdated);

  // Kept separate from useJobStatusAdvance's advance() — SwipeToAccept
  // needs a rejected promise to snap its thumb back for a retry, while
  // advance() deliberately swallows errors into its own `error` state
  // instead (right for a plain Button's fire-and-forget onPress, wrong
  // here). Mirrors the pre-existing Accept flow, just with local `job`
  // state kept in sync afterward instead of navigating back.
  async function handleAccept() {
    setAcceptError(null);
    try {
      const result = await submitJobStatus(job.id, "ACCEPTED");
      if (!result.sent) {
        setAcceptError("You're offline — this will sync automatically once you're back online.");
        return;
      }
      if (result.job) setJob(result.job);
    } catch (e) {
      setAcceptError(e instanceof ApiError ? e.message : "Could not accept this job. Try again.");
      throw e; // lets SwipeToAccept reset its slider for a retry
    }
  }

  const action = getNextAction(job);
  const isUpdating = statusAdvance.updatingId === job.id;
  const isQueued = statusAdvance.queuedIds.has(job.id);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Badge text={job.jobType.name} />
          <Badge text={job.status.replace("_", " ")} tone={STATUS_TONE[job.status]} />
        </View>
        <Text style={styles.title}>{job.title}</Text>
        {job.business && <Text style={styles.meta}>Client: {job.business.name}</Text>}

        {getLifecycleSteps(job).some((s) => s.status === job.status) && (
          <Card>
            <Text style={styles.sectionTitle}>Delivery Progress</Text>
            <LifecycleStepper job={job} />
          </Card>
        )}

        <Card>
          <Text style={styles.sectionTitle}>Route</Text>
          {job.pickupAddress && (
            <View style={styles.routeSection}>
              <AddressRow label="Pickup: " address={job.pickupAddress} />
              <Button title="Navigate to Pickup" onPress={() => openNavigationTo(job.pickupAddress!)} />
            </View>
          )}
          {job.dropoffStops.map((stop, i) => (
            <View key={stop.id} style={styles.routeSection}>
              <AddressRow label={job.dropoffStops.length > 1 ? `Stop ${i + 1}: ` : "Dropoff: "} address={stop.address} />
              <Button
                title={job.dropoffStops.length > 1 ? `Navigate to Stop ${i + 1}` : "Navigate to Dropoff"}
                onPress={() => openNavigationTo(stop.address)}
              />
            </View>
          ))}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Freight Info</Text>
          <Text style={styles.meta}>{job.notes || "No additional notes for this job."}</Text>
        </Card>

        {job.clientPhone && (
          <Card>
            <Text style={styles.sectionTitle}>Client Contact</Text>
            <Text style={styles.meta}>{job.clientPhone}</Text>
            <ClientContactButtons phone={job.clientPhone} />
          </Card>
        )}

        {hasReachedAnyStage(job) && (
          <Card>
            <Text style={styles.sectionTitle}>Progress</Text>
            <JobStageBadges job={job} style={{ marginTop: 0 }} />
          </Card>
        )}

        {job.status === "FAILED" && job.failureReason && <Text style={styles.failureText}>Failed: {job.failureReason}</Text>}
      </ScrollView>

      {job.status === "ASSIGNED" && (
        <View style={[styles.actionBar, { paddingBottom: spacing.md + insets.bottom }]}>
          <ErrorText>{acceptError}</ErrorText>
          <SwipeToAccept label="Slide to Accept Job →" completedLabel="Job Accepted" onComplete={handleAccept} />
        </View>
      )}

      {action && job.status !== "ASSIGNED" && (
        <View style={[styles.actionBar, { paddingBottom: spacing.md + insets.bottom }]}>
          <ErrorText>{statusAdvance.error}</ErrorText>
          {statusAdvance.notice && <Text style={styles.notice}>{statusAdvance.notice}</Text>}
          <Button title={action.label} onPress={() => statusAdvance.advance(job)} loading={isUpdating} disabled={isQueued} />
          {canFail(job.status) && (
            <Button
              title="Mark Failed / Undelivered"
              variant="danger"
              onPress={() => statusAdvance.requestMarkFailed(job)}
              disabled={isQueued || isUpdating}
            />
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
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  routeSection: { marginBottom: spacing.sm },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  failureText: { color: colors.danger, fontSize: 14, fontWeight: "600", marginTop: spacing.sm },
  notice: { color: colors.primary, fontSize: 13, marginBottom: spacing.sm },
  actionBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  });
}

function makeStepperStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
    label: { color: colors.textMuted, fontSize: 14 },
    labelDone: { color: colors.text },
    labelActive: { color: colors.primary, fontWeight: "700" },
  });
}
