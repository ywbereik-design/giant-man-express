// Dynamic config (not static app.json) so the Google Maps API key can be
// pulled from .env at prebuild/build time — a plain app.json can't
// reference process.env.
module.exports = {
  expo: {
    name: "Giant Man Express",
    slug: "giant-man-express",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "ca.giantmanexpress.app",
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: "ca.giantmanexpress.app",
      versionCode: 1,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-secure-store",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Giant Man Express uses your location to record where you clock in and out.",
          locationAlwaysAndWhenInUsePermission:
            "Giant Man Express tracks your location and mileage while you're clocked in, including when the app is in the background.",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      [
        "expo-image-picker",
        {
          cameraPermission:
            "Giant Man Express uses your camera to take a clock-in selfie and proof-of-pickup/delivery photos.",
          microphonePermission: false,
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          // Matches the app's dark theme (colors.background in theme.ts) so
          // the launch screen doesn't flash white before the app renders.
          backgroundColor: "#0f1115",
        },
      ],
      "expo-font",
      // No plugin config of its own (piggybacks on expo-location's Android
      // foreground-service manifest entries) — listed explicitly anyway so
      // the full set of native modules this app depends on is documented
      // in one place, matching expo-location/expo-image-picker above.
      "expo-task-manager",
    ],
  },
};
