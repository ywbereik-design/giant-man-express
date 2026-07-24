import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "../../api/client";
import { Job, JobStatus } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";
import { DriverRouteMap } from "../../components/DriverRouteMap";
import { routeDestination } from "../../lib/routeDestination";
import { capturePhoto } from "../../lib/capturePhoto";
import { STATUS_TONE, STAGE_TIMESTAMPS } from "../../lib/jobStatus";
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

export function DriverJobsScreen() {
  const tabBarHeight = useDriverTabBarHeight();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function advance(job: Job) {
    const action = NEXT_ACTION[job.status];
    if (!action) return;
    setError(null);

    let photo: string | undefined;
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
    }

    setUpdatingId(job.id);
    try {
      await api.patch(`/api/driver/jobs/${job.id}/status`, { status: action.next, photo });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update job");
    } finally {
      setUpdatingId(null);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md + tabBarHeight }}
        data={jobs}
        keyExtractor={(j) => j.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => { setLoading(true); await load(); setLoading(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={!error ? <Text style={styles.empty}>No jobs assigned right now.</Text> : null}
        renderItem={({ item }) => {
          const action = NEXT_ACTION[item.status];
          const reachedStages = STAGE_TIMESTAMPS.filter((s) => item[s.field]);
          const destination = routeDestination(item);
          return (
            <Card>
              <View style={styles.headerRow}>
                <Badge text={item.jobType.name} />
                <Badge text={item.status.replace("_", " ")} tone={STATUS_TONE[item.status]} />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              {item.business && <Text style={styles.meta}>Client: {item.business.name}</Text>}
              {item.pickupAddress && (
                <View style={styles.addressRow}>
                  <Ionicons name="location" size={13} color={colors.textMuted} />
                  <Text style={styles.meta}>Pickup: {item.pickupAddress}</Text>
                </View>
              )}
              {item.dropoffStops.map((stop, i) => (
                <View key={stop.id} style={styles.addressRow}>
                  <Ionicons name="location" size={13} color={colors.textMuted} />
                  <Text style={styles.meta}>
                    {item.dropoffStops.length > 1 ? `Stop ${i + 1}: ` : "Dropoff: "}
                    {stop.address}
                  </Text>
                </View>
              ))}
              {item.notes && <Text style={styles.meta}>Notes: {item.notes}</Text>}
              {destination && (
                <DriverRouteMap destinationAddress={destination.address} destinationLabel={destination.label} />
              )}
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
              {action && (
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    title={action.label}
                    onPress={() => advance(item)}
                    loading={updatingId === item.id}
                  />
                </View>
              )}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.xs },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
});
