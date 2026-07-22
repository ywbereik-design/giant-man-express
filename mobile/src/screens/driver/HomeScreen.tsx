import React, { useCallback, useEffect, useState } from "react";
import { Text, View, StyleSheet, RefreshControl, ScrollView } from "react-native";
import * as Location from "expo-location";
import { api, ApiError } from "../../api/client";
import { TimeEntry } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { ChangePinCard } from "../../components/ChangePinCard";
import { colors, spacing } from "../../theme/theme";

interface StatusResponse {
  clockedIn: boolean;
  openEntry: TimeEntry | null;
}

const LOCATION_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

interface CoordsResult {
  coords?: { lat: number; lng: number };
  locationCaptured: boolean;
}

async function getCoords(): Promise<CoordsResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { locationCaptured: false };
  try {
    const pos = await withTimeout(Location.getCurrentPositionAsync({}), LOCATION_TIMEOUT_MS);
    return { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, locationCaptured: true };
  } catch {
    return { locationCaptured: false };
  }
}

export function HomeScreen() {
  const { session } = useAuth();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<StatusResponse>("/api/driver/status");
      setStatus(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleClockIn() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { coords, locationCaptured } = await getCoords();
      await api.post("/api/driver/clock-in", coords ?? {});
      if (!locationCaptured) {
        setNotice("Clocked in, but your location wasn't recorded (permission denied or unavailable).");
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not clock in");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { coords, locationCaptured } = await getCoords();
      await api.post("/api/driver/clock-out", coords ?? {});
      if (!locationCaptured) {
        setNotice("Clocked out, but your location wasn't recorded (permission denied or unavailable).");
      }
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not clock out");
    } finally {
      setBusy(false);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  const clockedIn = status?.clockedIn ?? false;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.greeting}>Hi, {session?.name}</Text>

      <Card>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: clockedIn ? colors.success : colors.textMuted }]} />
          <Text style={styles.statusText}>{clockedIn ? "Clocked In" : "Clocked Out"}</Text>
        </View>
        {clockedIn && status?.openEntry && (
          <Text style={styles.since}>
            Since {new Date(status.openEntry.clockInAt).toLocaleTimeString("en-CA")}
          </Text>
        )}

        <ErrorText>{error}</ErrorText>
        {notice && <Text style={styles.notice}>{notice}</Text>}

        {clockedIn ? (
          <Button title="Clock Out" variant="danger" onPress={handleClockOut} loading={busy} />
        ) : (
          <Button title="Clock In" onPress={handleClockIn} loading={busy} />
        )}
      </Card>

      <Text style={styles.hint}>
        Clocking in or out records your location so shift times can be verified.
      </Text>

      <View style={{ marginTop: spacing.lg }}>
        <ChangePinCard />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  greeting: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: spacing.md },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  statusText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  since: { color: colors.textMuted, marginBottom: spacing.md },
  notice: { color: colors.primary, marginBottom: spacing.md, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.sm },
});
