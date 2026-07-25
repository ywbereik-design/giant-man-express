import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { openAddressInMaps } from "../lib/openInMaps";
import { colors } from "../theme/theme";

interface Props {
  label: string;
  address: string;
}

// A pickup/dropoff address row that opens Google Maps on tap — shared by
// admin and driver job cards so both look and behave identically.
export function AddressRow({ label, address }: Props) {
  return (
    <Pressable style={styles.row} onPress={() => openAddressInMaps(address)} hitSlop={4}>
      <Ionicons name="location" size={13} color={colors.textMuted} />
      <Text style={styles.text}>
        {label}
        <Text style={styles.link}>{address}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  text: { color: colors.textMuted, fontSize: 13 },
  link: { color: colors.primary, textDecorationLine: "underline" },
});
