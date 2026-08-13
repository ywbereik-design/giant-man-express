import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, LayoutChangeEvent, Pressable, Text, View, StyleSheet } from "react-native";
import { PanGestureHandler, PanGestureHandlerGestureEvent, PanGestureHandlerStateChangeEvent, State } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

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

// Built on react-native-gesture-handler (already installed and mounted at
// the app root via GestureHandlerRootView — see App.tsx), not the legacy
// core-RN PanResponder API. Mixing PanResponder into a tree that RNGH's
// GestureHandlerRootView already owns is a well-known source of gestures
// silently not receiving touches on-device (RNGH takes over the native
// touch pipeline once installed), which is what made the first version of
// this component appear static. Doesn't need react-native-reanimated —
// the older callback-based PanGestureHandler API integrates directly with
// a plain core-RN Animated.Value.
export function SwipeToAccept({ label, completedLabel, onComplete, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [trackWidth, setTrackWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;
  const maxTranslate = Math.max(trackWidth - THUMB_SIZE, 0);
  const interactive = !disabled && !busy && !completed;

  // A custom pan gesture has no way to be performed by VoiceOver/TalkBack —
  // there's no drag to intercept once a screen reader owns the touch
  // stream. Without this, a screen-reader-dependent driver could not accept
  // any job at all. When a screen reader is on, the whole track becomes a
  // plain activatable button instead of a gesture surface.
  const [screenReaderOn, setScreenReaderOn] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReaderOn(enabled);
    });
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => setScreenReaderOn(enabled));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Deliberately plain functions, recreated on every render — NOT memoized
  // into a ref the way the original PanResponder instance was. That earlier
  // version froze maxTranslate at 0 (its value on the very first render,
  // before onLayout ever measured the track) inside the responder's
  // closures forever, which independently would have kept the thumb pinned
  // in place even if the touch-handling conflict above hadn't existed.
  // Plain per-render functions always see the current maxTranslate.
  function handleGestureEvent(event: PanGestureHandlerGestureEvent) {
    if (!interactive) return;
    const next = Math.min(Math.max(event.nativeEvent.translationX, 0), maxTranslate);
    translateX.setValue(next);
  }

  // Shared by both the gesture-completion path and the accessibility
  // activation path below — only the caller's onComplete/busy/completed
  // bookkeeping, no gesture-specific animation.
  async function runOnComplete() {
    setBusy(true);
    try {
      await onComplete();
      setCompleted(true);
    } catch {
      // The caller is responsible for surfacing *why* this failed (e.g.
      // an error banner) — this component just resets the gesture so the
      // driver can try again.
      Animated.spring(translateX, { toValue: 0, useNativeDriver: false }).start();
    } finally {
      setBusy(false);
    }
  }

  function handleStateChange(event: PanGestureHandlerStateChangeEvent) {
    // Only react to the gesture actually ending (a clean release, or being
    // cancelled/interrupted) — every other state transition is mid-gesture
    // and already handled by handleGestureEvent above.
    if (event.nativeEvent.oldState !== State.ACTIVE || !interactive) return;

    const next = Math.min(Math.max(event.nativeEvent.translationX, 0), maxTranslate);
    const crossedThreshold = maxTranslate > 0 && next >= maxTranslate * COMPLETE_THRESHOLD;

    if (!crossedThreshold) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
      return;
    }

    Animated.timing(translateX, { toValue: maxTranslate, duration: 120, useNativeDriver: false }).start(runOnComplete);
  }

  // Activated either by a screen reader's default double-tap (the whole
  // track is a Pressable when screenReaderOn) or by the "activate"
  // accessibility action exposed below regardless of screenReaderOn — some
  // assistive tech (e.g. Switch Control) isn't detected by
  // isScreenReaderEnabled but still can't perform an arbitrary pan gesture.
  function handleAccessibilityActivate() {
    if (!interactive) return;
    translateX.setValue(maxTranslate);
    runOnComplete();
  }

  const accessibilityLabel = completed ? completedLabel : label;
  const accessibilityActionProps = {
    accessibilityRole: "button" as const,
    accessibilityLabel,
    accessibilityState: { disabled: !interactive, busy },
    accessibilityActions: [{ name: "activate", label: accessibilityLabel }] as const,
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => {
      if (event.nativeEvent.actionName === "activate") handleAccessibilityActivate();
    },
  };

  if (screenReaderOn) {
    return (
      <Pressable
        style={styles.track}
        onPress={handleAccessibilityActivate}
        disabled={!interactive}
        accessible
        {...accessibilityActionProps}
      >
        <Text style={styles.label} numberOfLines={1}>
          {accessibilityLabel}
        </Text>
      </Pressable>
    );
  }

  // The whole track (not just the small thumb) is the gesture surface — a
  // driver naturally drags from wherever they first touch, not necessarily
  // the thumb's exact 56x56 hitbox, and handleGestureEvent already uses the
  // gesture's relative translationX so it doesn't matter where the touch
  // started. Also deliberately NOT `accessible` here (unlike the
  // screen-reader Pressable above) — marking a live gesture surface as a
  // single opaque accessibility element serves no purpose when no assistive
  // tech is listening, and has been a known source of touch-dispatch
  // interference on Android.
  return (
    <PanGestureHandler onGestureEvent={handleGestureEvent} onHandlerStateChange={handleStateChange} enabled={interactive}>
      <View
        style={styles.track}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
        {...accessibilityActionProps}
      >
        <Text style={styles.label} numberOfLines={1}>
          {accessibilityLabel}
        </Text>
        {!completed && (
          <Animated.View style={[styles.thumb, { transform: [{ translateX }] }, (disabled || busy) && styles.thumbDisabled]}>
            <Ionicons name={busy ? "hourglass-outline" : "chevron-forward"} size={26} color={colors.primaryText} />
          </Animated.View>
        )}
      </View>
    </PanGestureHandler>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
}
