import React from "react";
import { Pressable, ScrollView, Text, StyleSheet } from "react-native";
import { colors, spacing } from "../theme/theme";

export interface ChipOption {
  id: string;
  label: string;
}

export function ChipSelect({
  options,
  selectedId,
  onSelect,
}: {
  options: ChipOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
      {options.map((opt) => {
        const selected = opt.id === selectedId;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(opt.id)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "600" },
  chipTextSelected: { color: colors.primaryText },
});
