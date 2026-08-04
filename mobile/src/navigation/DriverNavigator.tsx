import React, { useState } from "react";
import { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigatorScreenParams } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { WelcomeScreen } from "../screens/driver/WelcomeScreen";
import { HomeScreen } from "../screens/driver/HomeScreen";
import { DriverJobsScreen } from "../screens/driver/JobsScreen";
import { JobDetailsScreen } from "../screens/driver/JobDetailsScreen";
import { HistoryScreen } from "../screens/driver/HistoryScreen";
import { LocationScreen } from "../screens/driver/LocationScreen";
import type { Job } from "../api/types";
import { DriverTopTabBar } from "./DriverTopTabBar";
import { DriverTabBarHeightContext } from "./DriverTabBarHeightContext";
import { LogoutButton } from "./LogoutButton";
import { useTheme } from "../theme/ThemeContext";

export type DriverTabParamList = {
  Home: undefined;
  Jobs: undefined;
  Location: undefined;
  History: undefined;
};

export type DriverStackParamList = {
  Welcome: undefined;
  // Lets WelcomeScreen's cards deep-link straight into a specific tab, e.g.
  // navigation.navigate("Main", { screen: "Jobs" }).
  Main: NavigatorScreenParams<DriverTabParamList> | undefined;
  // Pushed on top of Main (a sibling of it, not nested inside the Jobs tab)
  // so it gets a full-screen takeover without the DriverTopTabBar — reached
  // via navigation.getParent() from inside the Jobs tab, the same pattern
  // DriverTopTabBar's own back button already uses. Takes the job object
  // directly (already in memory in the Jobs list) rather than an id, since
  // there's no single-job GET endpoint and adding one isn't needed just to
  // view data the app already has.
  JobDetails: { job: Job };
};

const Tab = createBottomTabNavigator<DriverTabParamList>();
const Stack = createNativeStackNavigator<DriverStackParamList>();

// The bar's own content height (title/logout row + segmented tabs row +
// padding), excluding the device's safe-area top inset — computed from
// DriverTopTabBar's own style values, since onLayout measurement of that
// bar turned out not to fire reliably (confirmed via testing: never fires
// in the web preview). insets.top is added on top of this at render time
// via useSafeAreaInsets, which — unlike onLayout here — is reliable.
const TOP_BAR_CONTENT_HEIGHT = 92;

// The tab bar itself — Home/Jobs/History behind the top segmented control.
// Landed on from WelcomeScreen, not shown automatically on login.
function DriverTabs() {
  const insets = useSafeAreaInsets();
  const [tabBarHeight, setTabBarHeight] = useState(TOP_BAR_CONTENT_HEIGHT + insets.top);

  function onTabBarLayout(e: LayoutChangeEvent) {
    // Self-corrects to the exact measured height on platforms where this
    // does fire, refining the computed default above.
    setTabBarHeight(e.nativeEvent.layout.height);
  }

  return (
    <DriverTabBarHeightContext.Provider value={tabBarHeight}>
      <Tab.Navigator
        tabBar={(props) => <DriverTopTabBar {...props} onLayout={onTabBarLayout} />}
        screenOptions={{
          // The native header is replaced by DriverTopTabBar itself (title +
          // logout + tabs, all in one absolutely-positioned bar) — two
          // independent `position: absolute, top: 0` elements would overlap
          // instead of stacking.
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarLabel: "Home",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Jobs"
          component={DriverJobsScreen}
          options={{
            tabBarLabel: "Jobs",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "briefcase" : "briefcase-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Location"
          component={LocationScreen}
          options={{
            tabBarLabel: "Location",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "map" : "map-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarLabel: "History",
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? "time" : "time-outline"} size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </DriverTabBarHeightContext.Provider>
  );
}

// Welcome is the landing hub right after login — the driver picks where to
// go from there rather than being dropped straight into a tab. Main (the
// tab bar) is pushed on top of it, so the hardware/back gesture from any
// tab returns here rather than exiting or re-triggering auth.
export function DriverNavigator() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{
          title: "Giant Man Express",
          headerRight: () => (
            <LogoutButton warningMessage="If you're still clocked in, this won't end your shift — clock out first if you're done for the day." />
          ),
        }}
      />
      <Stack.Screen name="Main" component={DriverTabs} options={{ headerShown: false }} />
      <Stack.Screen name="JobDetails" component={JobDetailsScreen} options={{ title: "Job Details" }} />
    </Stack.Navigator>
  );
}
