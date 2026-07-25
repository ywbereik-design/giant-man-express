import React from "react";
import { Text, View, StyleSheet } from "react-native";
import * as SecureStore from "expo-secure-store";
import { Button } from "./ui";
import { SESSION_STORAGE_KEY } from "../auth/storage";
import { colors, spacing } from "../theme/theme";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Unhandled error caught by ErrorBoundary:", error);
  }

  retry = () => {
    this.setState({ hasError: false });
  };

  // This boundary wraps AuthProvider itself (see App.tsx), so if the crash
  // was caused by corrupted persisted session data (e.g. AuthContext's
  // restore effect throwing on a bad SecureStore value), a same-state retry
  // would hit the exact same crash immediately — there's no escape hatch.
  // Clearing the stored session directly (can't go through useAuth().logout
  // here; nothing above this boundary provides that context if it's what
  // crashed) guarantees the retry at least reaches the login screen.
  resetAndRetry = async () => {
    try {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    } catch {
      // best-effort
    }
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            Try again below. If it keeps happening, logging out and back in usually clears it — let the office know
            either way.
          </Text>
          <Button title="Try Again" onPress={this.retry} />
          <Button title="Log Out & Try Again" variant="secondary" onPress={this.resetAndRetry} />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: spacing.sm },
  subtitle: { color: colors.textMuted, textAlign: "center", marginBottom: spacing.lg },
});
