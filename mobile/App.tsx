import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as Updates from "expo-updates";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";

// Split out so it can call useTheme() — the hook needs to render inside
// ThemeProvider, not alongside it.
function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
}

// Without this, expo-updates' default behavior (checkAutomatically: "ON_LOAD")
// only checks for and downloads a new update on cold start, then keeps
// running the OLD bundle for that entire session — the new one only takes
// effect on the NEXT cold start after that. That two-relaunch requirement is
// easy to miss (a driver backgrounding rather than fully closing the app
// doesn't count as a relaunch at all), which is exactly what happened when a
// published update didn't visibly land despite the app being reopened
// several times. Explicitly check -> fetch -> reload here instead, so a
// single relaunch is enough. isEnabled is false in Expo Go/dev client (no
// updates configured there) and any failure here (offline, etc.) is silently
// ignored — the app just keeps running its current bundle, exactly like the
// default behavior would, no user-facing error.
function useApplyPendingUpdate() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetch = await Updates.fetchUpdateAsync();
        if (fetch.isNew) await Updates.reloadAsync();
      } catch {
        // Offline, timed out, etc. — next launch tries again.
      }
    })();
  }, []);
}

export default function App() {
  useApplyPendingUpdate();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
            <ThemedStatusBar />
          </ThemeProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
