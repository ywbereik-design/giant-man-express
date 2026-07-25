import React from "react";
import { Alert, Linking, View, StyleSheet } from "react-native";
import { Button } from "./ui";
import { spacing } from "../theme/theme";

interface Props {
  phone: string;
}

function cleanPhoneForDialing(phone: string): string {
  // tel:/whatsapp: URLs want digits (and a leading +), not the spaces,
  // dashes, or parens a dispatcher might have typed into the job form.
  return phone.replace(/[^\d+]/g, "");
}

export function CustomerContactButtons({ phone }: Props) {
  const cleaned = cleanPhoneForDialing(phone);

  async function call() {
    try {
      await Linking.openURL(`tel:${cleaned}`);
    } catch {
      Alert.alert("Can't place call", "This device can't make phone calls.");
    }
  }

  async function whatsapp() {
    const message =
      "Hello, I am your delivery driver and I'm on my way to your address.";
    try {
      await Linking.openURL(`whatsapp://send?phone=${encodeURIComponent(cleaned)}&text=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert("WhatsApp not available", "WhatsApp isn't installed on this device.");
    }
  }

  return (
    <View style={styles.row}>
      <View style={styles.button}>
        <Button title="Call" variant="secondary" onPress={call} />
      </View>
      <View style={styles.button}>
        <Button title="WhatsApp" variant="secondary" onPress={whatsapp} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  button: { flex: 1 },
});
