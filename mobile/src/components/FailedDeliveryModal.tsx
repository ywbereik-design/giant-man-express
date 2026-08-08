import React, { useMemo } from "react";
import { Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { FAILURE_REASONS, FailureReason } from "../api/types";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  visible: boolean;
  onSelect: (reason: FailureReason) => void;
  onCancel: () => void;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
    },
    title: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: spacing.md },
    reasonRow: {
      paddingVertical: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    reasonText: { color: colors.text, fontSize: 16 },
    cancelRow: { paddingVertical: spacing.md, marginTop: spacing.sm, alignItems: "center" },
    cancelText: { color: colors.textMuted, fontSize: 15, fontWeight: "600" },
  });
}

// A required, closed list of reasons (rather than free text) so a driver
// can't skip explaining a failed delivery, and admin/dispatch reporting on
// failures stays consistent.
export function FailedDeliveryModal({ visible, onSelect, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Why did this delivery fail?</Text>
          {FAILURE_REASONS.map((reason) => (
            <Pressable
              key={reason}
              style={styles.reasonRow}
              onPress={() => onSelect(reason)}
              accessibilityRole="button"
              accessibilityLabel={reason}
            >
              <Text style={styles.reasonText}>{reason}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancelRow} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
