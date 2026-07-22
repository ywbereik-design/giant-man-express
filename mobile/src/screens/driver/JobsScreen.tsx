import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { api, ApiError } from "../../api/client";
import { Job, JobStatus } from "../../api/types";
import { Badge, Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { colors, spacing } from "../../theme/theme";

const STATUS_TONE: Record<JobStatus, "info" | "success" | "danger" | "muted"> = {
  ASSIGNED: "info",
  ACCEPTED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "muted",
};

const NEXT_ACTION: Partial<Record<JobStatus, { label: string; next: JobStatus }>> = {
  ASSIGNED: { label: "Accept Job", next: "ACCEPTED" },
  ACCEPTED: { label: "Arrived", next: "IN_PROGRESS" },
  IN_PROGRESS: { label: "Mark Completed", next: "COMPLETED" },
};

// Takes a front-camera selfie and compresses it down to something small
// enough to send over mobile data and store inline — resized to a modest
// width and re-encoded as a JPEG at moderate quality. Returns null if the
// driver backs out of the camera (not an error, just no photo taken).
async function captureArrivalSelfie(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Camera permission is required to mark arrival");
  }

  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    quality: 0.7,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const context = ImageManipulator.manipulate(result.assets[0].uri);
  context.resize({ width: 800 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  if (!saved.base64) return null;

  return `data:image/jpeg;base64,${saved.base64}`;
}

export function DriverJobsScreen() {
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

    let selfie: string | undefined;
    if (action.next === "IN_PROGRESS") {
      try {
        const photo = await captureArrivalSelfie();
        if (!photo) return; // driver backed out of the camera — no partial state change
        selfie = photo;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not capture arrival selfie");
        return;
      }
    }

    setUpdatingId(job.id);
    try {
      await api.patch(`/api/driver/jobs/${job.id}/status`, { status: action.next, ...(selfie ? { selfie } : {}) });
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
        contentContainerStyle={{ padding: spacing.md }}
        data={jobs}
        keyExtractor={(j) => j.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={async () => { setLoading(true); await load(); setLoading(false); }} tintColor={colors.primary} />}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={<Text style={styles.empty}>No jobs assigned right now.</Text>}
        renderItem={({ item }) => {
          const action = NEXT_ACTION[item.status];
          return (
            <Card>
              <View style={styles.headerRow}>
                <Badge text={item.jobType.name} />
                <Badge text={item.status.replace("_", " ")} tone={STATUS_TONE[item.status]} />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              {item.business && <Text style={styles.meta}>Client: {item.business.name}</Text>}
              {item.pickupAddress && <Text style={styles.meta}>Pickup: {item.pickupAddress}</Text>}
              {item.dropoffAddress && <Text style={styles.meta}>Dropoff: {item.dropoffAddress}</Text>}
              {item.notes && <Text style={styles.meta}>Notes: {item.notes}</Text>}
              {item.arrivedAt && (
                <Text style={styles.meta}>Arrived: {new Date(item.arrivedAt).toLocaleTimeString("en-CA")}</Text>
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
});
