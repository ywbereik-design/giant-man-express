import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Job } from "../../api/types";
import { Badge, Card, CenteredSpinner, ErrorText, SectionTitle } from "../../components/ui";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";
import { DriverRouteMap } from "../../components/DriverRouteMap";
import { routeDestination } from "../../lib/routeDestination";

const ACTIVE_STATUSES: Job["status"][] = ["ACCEPTED", "ARRIVED", "PICKED_UP", "ON_THE_WAY"];

// Dedicated full-screen view of the driver's live route — the same map used
// inline on the Jobs tab, but as its own destination so a driver can check
// their route/ETA without scrolling through the full job list.
export function LocationScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabBarHeight = useDriverTabBarHeight();
  const [job, setJob] = useState<Job | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ jobs: Job[] }>("/api/driver/jobs");
      setJob(res.jobs.find((j) => ACTIVE_STATUSES.includes(j.status)) ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your route");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (initialLoading) return <CenteredSpinner />;

  const destination = job ? routeDestination(job) : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md + tabBarHeight }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <SectionTitle>Live Route</SectionTitle>
      <ErrorText>{error}</ErrorText>

      {!job && (
        <Card>
          <Text style={styles.empty}>No active job right now — accept a job to see your live route here.</Text>
        </Card>
      )}

      {job && (
        <Card>
          <View style={styles.headerRow}>
            <Badge text={job.jobType.name} />
            <Badge text={job.status.replace("_", " ")} tone="info" />
          </View>
          <Text style={styles.title}>{job.title}</Text>
          {job.business && <Text style={styles.meta}>Client: {job.business.name}</Text>}
          {job.pickupAddress && <Text style={styles.meta}>Pickup: {job.pickupAddress}</Text>}
          {job.dropoffStops.map((stop, i) => (
            <Text key={stop.id} style={styles.meta}>
              {job.dropoffStops.length > 1 ? `Stop ${i + 1}: ` : "Dropoff: "}
              {stop.address}
            </Text>
          ))}
          {job.notes && <Text style={styles.meta}>Notes: {job.notes}</Text>}

          {destination ? (
            <DriverRouteMap destinationAddress={destination.address} destinationLabel={destination.label} />
          ) : (
            <Text style={styles.empty}>No destination address to route to yet.</Text>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, marginTop: spacing.sm },
  });
}
