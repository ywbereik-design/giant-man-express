import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Job } from "../api/types";
import { STAGE_TIMESTAMPS } from "../lib/jobStatus";
import { formatTime } from "../lib/dateRange";
import { Badge } from "./ui";
import { spacing } from "../theme/theme";

// Renders one muted Badge per stage timestamp the job has actually reached
// (Accepted, Arrived, Picked up, ...), or nothing at all if none have —
// callers that need to know that in advance (e.g. to decide whether to
// render a surrounding "Progress" Card) should check hasReachedAnyStage(job)
// from lib/jobStatus.ts instead of re-deriving this same filter themselves.
export function JobStageBadges({ job, style }: { job: Job; style?: StyleProp<ViewStyle> }) {
  const reachedStages = STAGE_TIMESTAMPS.filter((s) => job[s.field]);
  if (reachedStages.length === 0) return null;
  return (
    <View style={[styles.stageRow, style]}>
      {reachedStages.map((s) => (
        <Badge
          key={s.field}
          text={`${s.label} ${formatTime(job[s.field] as string, { hour: "numeric", minute: "2-digit" })}`}
          tone="muted"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
});
