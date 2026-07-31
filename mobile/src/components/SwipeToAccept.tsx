import React, { useRef, useState } from "react";
import { Animated, LayoutChangeEvent, PanResponder, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";

interface Props {
  label: string;
  completedLabel: string;
  // Called once the driver drags the thumb past the completion threshold.
  // Rejecting/throwing snaps the thumb back to the start so they can retry —
  // this component only owns the gesture, the caller decides what "accept"
  // actually does and how to surface an error.
  onComplete: () => Promise<void> | void;
  disabled?: boolean;
}

const THUMB_SIZE = 56;
// Fraction of the available track the thumb must cross to count as a full
// swipe — not exactly 100%, since requiring the very last pixel makes a
// deliberate, unhurried swipe feel like it "failed" right at the end.
const COMPLETE_THRESHOLD = 0.85;

// A real drag gesture (not a tap-disguised-as-a-slider) — built on core
// React Native Animated + PanResponder rather than adding a new gesture/
// animation dependency (react-native-reanimated isn't installed, and this
// app already avoids adding native deps beyond what's actually needed).
export function SwipeToAccept({ label, completedLabel, onComplete, disabled }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE, 0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !busy && !completed,
      onMoveShouldSetPanResponder: () => !disabled && !busy && !completed,
      onPanResponderMove: (_evt, gesture) => {
        const next = Math.min(Math.max(gesture.dx, 0), maxTranslate);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const next = Math.min(Math.max(gesture.dx, 0), maxTranslate);
        const crossedThreshold = maxTranslate > 0 && next >= maxTranslate * COMPLETE_THRESHOLD;

        if (!crossedThreshold) {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
          return;
        }

        Animated.timing(translateX, { toValue: maxTranslate, duration: 120, useNativeDriver: false }).start(async () => {
          setBusy(true);
          try {
            await onComplete();
            setCompleted(true);
          } catch {
            // The caller is responsible for surfacing *why* this failed
            // (e.g. an error banner) — this component just resets the
            // gesture so the driver can try again.
            Animated.spring(translateX, { toValue: 0, useNativeDriver: false }).start();
          } finally {
            setBusy(false);
          }
        });
      },
    })
  ).current;

  return (
    <View style={styles.track} onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.label} numberOfLines={1}>
        {completed ? completedLabel : label}
      </Text>
      {!completed && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[styles.thumb, { transform: [{ translateX }] }, (disabled || busy) && styles.thumbDisabled]}
        >
          <Ionicons name={busy ? "hourglass-outline" : "chevron-forward"} size={26} color={colors.primaryText} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    position: "absolute",
    alignSelf: "center",
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  thumb: {
    position: "absolute",
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbDisabled: {
    opacity: 0.7,
  },
});
