import React, { memo, useMemo, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  uri: string;
  size?: number;
  // Verification metadata (GPS + timestamp) captured alongside the photo —
  // shown as an overlay on the full-screen view, not burned into the image
  // itself, so it stays trustworthy (server-recorded, not editable pixels).
  caption?: string;
}

// Tap-to-expand photo thumbnail — self-contained (manages its own
// full-screen viewer Modal), so screens don't need to lift viewing state
// just to show a proof photo. Used for clock-in selfies and pickup/delivery
// proof photos alike. Memoized since it typically renders inside a list row
// (up to two per job card) — its own uri/size/caption props rarely change
// once a job's photos are set, so there's no reason to re-decode on every
// unrelated re-render of its parent.
export const PhotoThumbnail = memo(function PhotoThumbnail({ uri, size = 56, caption }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [viewing, setViewing] = useState(false);

  return (
    <>
      <Pressable onPress={() => setViewing(true)}>
        <Image
          source={{ uri }}
          style={[styles.thumbnail, { width: size, height: size }]}
          resizeMode="cover"
          // Android-only: without this, the platform decodes the photo at
          // its full captured resolution (up to 1024px wide — see
          // capturePhoto.ts) and scales the bitmap down for display, which
          // holds several times more pixel data in memory than a 56x56
          // thumbnail ever needs. "resize" asks the decoder to downsample
          // to the target size up front instead. No-op on iOS.
          resizeMethod="resize"
        />
      </Pressable>
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(false)}>
          <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
          {caption && (
            <View style={styles.captionBar}>
              <Text style={styles.captionText}>{caption}</Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
});

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  thumbnail: { borderRadius: 8, backgroundColor: colors.surfaceAlt },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerImage: { width: "100%", height: "80%" },
  captionBar: {
    position: "absolute",
    bottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 8,
  },
  captionText: { color: colors.text, fontSize: 12, textAlign: "center" },
  });
}
