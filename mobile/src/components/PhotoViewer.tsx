import React, { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/theme";

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
// proof photos alike.
export function PhotoThumbnail({ uri, size = 56, caption }: Props) {
  const [viewing, setViewing] = useState(false);

  return (
    <>
      <Pressable onPress={() => setViewing(true)}>
        <Image source={{ uri }} style={[styles.thumbnail, { width: size, height: size }]} />
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
}

const styles = StyleSheet.create({
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
