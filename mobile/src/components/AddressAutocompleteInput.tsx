import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInputProps, View, StyleSheet } from "react-native";
import { FieldInput } from "./ui";
import { AddressSuggestion, fetchAddressSuggestions } from "../lib/googleMaps";
import { spacing, ThemeColors } from "../theme/theme";
import { useTheme } from "../theme/ThemeContext";

interface Props extends Omit<TextInputProps, "value" | "onChangeText"> {
  value: string;
  onChangeText: (text: string) => void;
}

const DEBOUNCE_MS = 300;

// A plain FieldInput with a live Google Places dropdown underneath — unlike
// the Business/Driver ChipSelect pickers (a small, fixed, pre-loaded list),
// an address has no fixed set of valid values, so this queries Google on
// every keystroke (debounced) instead. Selecting a suggestion fills the
// field with its full formatted address; typing without ever selecting one
// still works exactly like a plain FieldInput — this only ever offers to
// autocomplete, it never blocks free text.
export function AddressAutocompleteInput({ value, onChangeText, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow, now-stale request overwriting the results of a
  // newer keystroke's request that happened to resolve first.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!focused || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const seq = ++requestSeq.current;
    debounceRef.current = setTimeout(async () => {
      const results = await fetchAddressSuggestions(value);
      if (seq === requestSeq.current) setSuggestions(results);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, focused]);

  function selectSuggestion(description: string) {
    onChangeText(description);
    setSuggestions([]);
    setFocused(false);
  }

  return (
    <View>
      <FieldInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        // Delayed so a tap on a suggestion below (which blurs the input
        // first on some platforms) still lands before the dropdown hides.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        {...rest}
      />
      {focused && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((s, i) => (
            <Pressable
              key={s.placeId}
              style={[styles.row, i > 0 && styles.rowDivider]}
              onPress={() => selectSuggestion(s.description)}
            >
              <Text style={styles.rowText} numberOfLines={2}>
                {s.description}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    dropdown: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
      overflow: "hidden",
    },
    row: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowText: { color: colors.text, fontSize: 14 },
  });
}
