import React, { useMemo, useState } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ApiError } from "../../api/client";
import { Badge, Card, ErrorText } from "../../components/ui";
import { AddressRow } from "../../components/AddressRow";
import { ClientContactButtons } from "../../components/ClientContactButtons";
import { SwipeToAccept } from "../../components/SwipeToAccept";
import { submitJobStatus } from "../../lib/submitJobStatus";
import { STATUS_TONE, hasReachedAnyStage } from "../../lib/jobStatus";
import { JobStageBadges } from "../../components/JobStageBadges";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import type { DriverStackParamList } from "../../navigation/DriverNavigator";

type Props = NativeStackScreenProps<DriverStackParamList, "JobDetails">;

// Reached by tapping a job card in the list ("click to view") — the single
// place a driver both reviews a job's full details and, for a newly
// assigned one, accepts it. Accepting is deliberately only possible here,
// via the swipe gesture below, not a plain tappable button on the card —
// see JobsScreen.tsx, which no longer renders an Accept button at all.
export function JobDetailsScreen({ route, navigation }: Props) {
  const { job } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    try {
      const result = await submitJobStatus(job.id, "ACCEPTED");
      if (!result.sent) {
        // Stay on this screen instead of navigating back immediately — the
        // previous behavior called goBack() right after setting this notice,
        // so it was never actually visible before the screen unmounted. The
        // driver can back out manually once they've read it.
        setError("You're offline — this will sync automatically once you're back online.");
        return;
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not accept this job. Try again.");
      throw e; // lets SwipeToAccept reset its slider for a retry
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Badge text={job.jobType.name} />
          <Badge text={job.status.replace("_", " ")} tone={STATUS_TONE[job.status]} />
        </View>
        <Text style={styles.title}>{job.title}</Text>
        {job.business && <Text style={styles.meta}>Client: {job.business.name}</Text>}

        <Card>
          <Text style={styles.sectionTitle}>Route</Text>
          {job.pickupAddress ? (
            <AddressRow label="Pickup: " address={job.pickupAddress} />
          ) : (
            <Text style={styles.meta}>No pickup address on file.</Text>
          )}
          {job.dropoffStops.map((stop, i) => (
            <AddressRow
              key={stop.id}
              label={job.dropoffStops.length > 1 ? `Stop ${i + 1}: ` : "Dropoff: "}
              address={stop.address}
            />
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
        <View style={[styles.acceptBar, { paddingBottom: spacing.md + insets.bottom }]}>
          <ErrorText>{error}</ErrorText>
          <SwipeToAccept label="Slide to Accept Job →" completedLabel="Job Accepted" onComplete={handleAccept} />
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  failureText: { color: colors.danger, fontSize: 14, fontWeight: "600", marginTop: spacing.sm },
  acceptBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  });
}
