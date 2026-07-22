import React, { useState } from "react";
import { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { HomeScreen } from "../screens/driver/HomeScreen";
import { DriverJobsScreen } from "../screens/driver/JobsScreen";
import { HistoryScreen } from "../screens/driver/HistoryScreen";
import { DriverTopTabBar } from "./DriverTopTabBar";
import { DriverTabBarHeightContext } from "./DriverTabBarHeightContext";

const Tab = createBottomTabNavigator();

// The bar's own content height (title/logout row + segmented tabs row +
// padding), excluding the device's safe-area top inset — computed from
// DriverTopTabBar's own style values, since onLayout measurement of that
// bar turned out not to fire reliably (confirmed via testing: never fires
// in the web preview). insets.top is added on top of this at render time
// via useSafeAreaInsets, which — unlike onLayout here — is reliable.
const TOP_BAR_CONTENT_HEIGHT = 92;

export function DriverNavigator() {
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
