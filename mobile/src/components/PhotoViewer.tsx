import React, { useState } from "react";
import { Image, Modal, Pressable, StyleSheet } from "react-native";
import { colors } from "../theme/theme";

interface Props {
  uri: string;
  size?: number;
}

// Tap-to-expand photo thumbnail — self-contained (manages its own
// full-screen viewer Modal), so screens don't need to lift viewing state
// just to show a proof photo. Used for clock-in selfies and pickup/delivery
// proof photos alike.
export function PhotoThumbnail({ uri, size = 56 }: Props) {
  const [viewing, setViewing] = useState(false);

  return (
    <>
      <Pressable onPress={() => setViewing(true)}>
        <Image source={{ uri }} style={[styles.thumbnail, { width: size, height: size }]} />
      </Pressable>
      <Modal visible={viewing} transparent animationType="fade" onRequestClose={() => setViewing(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewing(false)}>
          <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
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
});
