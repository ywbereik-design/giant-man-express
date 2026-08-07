import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View, StyleSheet, RefreshControl, ScrollView, AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { TimeEntry } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Button, Card, CenteredSpinner, ErrorText } from "../../components/ui";
import { ChangePinCard } from "../../components/ChangePinCard";
import { spacing, ThemeColors } from "../../theme/theme";
import { useTheme } from "../../theme/ThemeContext";
import { isShiftTrackingActive, startShiftTracking, stopShiftTracking } from "../../location/shiftTracking";
import { captureSelfie } from "../../lib/captureSelfie";
import { getCoords } from "../../lib/getCoords";
import { submitClockAction, flushQueuedClockActions } from "../../lib/clockQueue";
import { formatTime } from "../../lib/dateRange";
import { useDriverTabBarHeight } from "../../navigation/DriverTabBarHeightContext";

interface StatusResponse {
  clockedIn: boolean;
  openEntry: TimeEntry | null;
}

export function HomeScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tabBarHeight = useDriverTabBarHeight();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Best-effort — a still-offline flush just leaves the queue as-is; any
    // genuinely rejected item is dropped inside flushQueuedClockActions
    // itself, not here.
    await flushQueuedClockActions().catch(() => {});
    try {
      const res = await api.get<StatusResponse>("/api/driver/status");
      setStatus(res);

      // Keep tracking in sync with the server's view of the shift — resumes
      // it after an app relaunch while still clocked in, and stops a stray
      // task if the server thinks the shift is closed (e.g. clocked out from
      // another device).
      const trackingActive = await isShiftTrackingActive();
      if (res.clockedIn && !trackingActive) {
        await startShiftTracking();
      } else if (!res.clockedIn && trackingActive) {
        await stopShiftTracking();
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  // useFocusEffect, not a plain useEffect, so this tab's clock-in status
  // re-syncs whenever the driver navigates back to it — this screen stays
  // mounted (tab navigators keep sibling screens alive), so a plain effect
  // would only run once and could show a stale "Clocked In"/"Clocked Out"
  // state after the shift changed elsewhere (another device, an admin
  // action) while the driver was on a different tab.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // useFocusEffect only fires on screen navigation — a driver who just
  // backgrounds the app and returns to it without navigating anywhere
  // (e.g. leaves it on Home the whole time) would otherwise never re-sync:
  // not the clock status (missing a remote clock-out), and not tracking
  // itself if the OS suspended it while backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") load();
    });
    return () => subscription.remove();
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
      let selfie: string | null;
      try {
        selfie = await captureSelfie();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open the camera");
        return;
      }
      if (!selfie) {
        // Driver backed out of the camera — a selfie is required to clock
        // in, so stop here rather than starting a shift with no proof photo.
        setError("A selfie is required to clock in.");
        return;
      }

      const { coords, locationCaptured } = await getCoords();
      // On a genuine network failure this queues the clock-in instead of
      // throwing — same resilience the offline job-status queue already
      // gives every other driver action. Start tracking regardless of
      // whether it was sent live or queued: the driver's shift has actually
      // started either way, and deferring that until the server confirms
      // (which might not happen for a while, offline) would silently miss
      // mileage for however long the connection stays down.
      const sent = await submitClockAction("clock-in", { ...(coords ?? {}), selfie });

      const trackingMode = await startShiftTracking();
      const notices: string[] = [];
      if (!sent) {
        notices.push("You're offline — clocking in is saved and will sync automatically once you're back online.");
      }
      if (!locationCaptured) {
        notices.push("Clocked in, but your location wasn't recorded (permission denied or unavailable).");
      }
      if (trackingMode === "denied") {
        notices.push("Mileage tracking is off — location permission wasn't granted.");
      } else if (trackingMode === "foreground-only") {
        notices.push("Mileage tracking only while the app is open — background location wasn't granted.");
      }
      if (notices.length) setNotice(notices.join(" "));

      if (sent) {
        await load();
      } else {
        // Don't call load() here — the server doesn't know about this
        // clock-in yet, so it would still report clockedIn: false and
        // undo the UI state (and the tracking start above) we just set.
        setStatus((prev) => ({ clockedIn: true, openEntry: prev?.openEntry ?? null }));
      }
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
    // Tracking is now stopped AFTER the clock-out attempt resolves, not
    // before — stopping first meant a request that failed for a real
    // reason (not just "offline") left tracking off while the server still
    // thought the shift was open, with nothing recording mileage in
    // between. "Sent live" and "queued" both stop tracking (the driver is
    // genuinely done either way); an actual rejection below does not.
    try {
      const { coords, locationCaptured } = await getCoords();
      const sent = await submitClockAction("clock-out", coords ?? {});
      try {
        await stopShiftTracking();
      } catch {
        // best-effort — don't block clocking out on this
      }
      if (sent) {
        if (!locationCaptured) {
          setNotice("Clocked out, but your location wasn't recorded (permission denied or unavailable).");
        }
        await load();
      } else {
        // Don't call load() here — the server doesn't know about this
        // clock-out yet and would still report clockedIn: true, undoing
        // the local state (and the tracking stop above) we just set.
        setStatus((prev) => (prev ? { ...prev, clockedIn: false } : prev));
        setNotice("You're offline — clocking out is saved and will sync automatically once you're back online.");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not clock out");
    } finally {
      setBusy(false);
    }
  }

  if (initialLoading) return <CenteredSpinner />;

  const clockedIn = status?.clockedIn ?? false;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.md, paddingTop: spacing.md + tabBarHeight }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.greeting}>Hi, {session?.name}</Text>

        <Card>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: clockedIn ? colors.success : colors.textMuted }]} />
            <Text style={styles.statusText}>{clockedIn ? "Clocked In" : "Clocked Out"}</Text>
          </View>
          {clockedIn && status?.openEntry && (
            <>
              <Text style={styles.since}>
                Since {formatTime(status.openEntry.clockInAt)}
              </Text>
              <Text style={styles.since}>
                Distance this shift: {status.openEntry.distanceKm.toFixed(1)} km
              </Text>
            </>
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
          Clocking in takes a quick selfie and tracks your location and mileage until you clock out.
        </Text>

        <View style={{ marginTop: spacing.lg }}>
          <ChangePinCard />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  greeting: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: spacing.md },
  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  statusText: { color: colors.text, fontSize: 18, fontWeight: "600" },
  since: { color: colors.textMuted, marginBottom: spacing.md },
  notice: { color: colors.primary, marginBottom: spacing.md, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: "center", marginTop: spacing.sm },
  });
}
