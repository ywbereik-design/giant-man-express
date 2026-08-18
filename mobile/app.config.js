const { withAndroidManifest } = require("expo/config-plugins");

// On Android 11+, an app can't see or launch another installed app unless
// it's declared in a <queries> block — without this, Linking.openURL for a
// whatsapp:// URL can silently fail on real devices (falling into
// ClientContactButtons' "not available" catch) even with WhatsApp
// installed, while working fine in Expo Go (which has its own, broader
// manifest and isn't affected). Only takes effect in a native
// prebuild/EAS build, not in Expo Go itself.
function withWhatsAppQuery(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!Array.isArray(manifest.queries)) manifest.queries = [{}];
    const queryBlock = manifest.queries[0];
    if (!Array.isArray(queryBlock.package)) queryBlock.package = [];
    const alreadyDeclared = queryBlock.package.some((p) => p.$?.["android:name"] === "com.whatsapp");
    if (!alreadyDeclared) queryBlock.package.push({ $: { "android:name": "com.whatsapp" } });
    return config;
  });
}

// Dynamic config (not static app.json) so EAS_PROJECT_ID (below) and other
// build-time values can be pulled from .env — a plain app.json can't
// reference process.env.
const expoConfig = {
    name: "Giant Man Express",
    slug: "giant-man-express",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "ca.giantmanexpress.app",
      // iOS equivalent of the Android <queries> block below — without this,
      // Linking.openURL("whatsapp://...") can be silently treated as
      // unavailable on a real device even with WhatsApp installed.
      infoPlist: {
        LSApplicationQueriesSchemes: ["whatsapp"],
      },
    },
    android: {
      package: "ca.giantmanexpress.app",
      versionCode: 1,
      adaptiveIcon: {
        // backgroundImage used to point at a leftover default Expo template
        // asset (alignment guide circles, never actually replaced) — a
        // plain backgroundColor is simpler and correct here. White to match
        // the main icon.png's background.
        backgroundColor: "#FFFFFF",
        foregroundImage: "./assets/android-icon-foreground.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
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
      // Lets an EAS "development" build (see eas.json) load JS from this
      // machine's Metro server the same way Expo Go does — without it, a
      // dev build is just a static release build with no way to connect
      // back to `npx expo start`.
      "expo-dev-client",
      // Without this, `expo prebuild` (which every EAS build runs fresh —
      // there's no checked-in android/ios directory) never applies
      // expo-updates' own config plugin, so the native Info.plist/
      // AndroidManifest never gets the `updates.url`/runtimeVersion below
      // embedded into them. The app would still build and run fine, but
      // every real installed build would have no update URL baked in at
      // all, silently breaking the entire EAS Update workflow (see the
      // `updates` field below) — an `eas update` publish would never reach
      // a single device, with no error surfaced anywhere.
      "expo-updates",
    ],
};

module.exports = {
  expo: {
    ...withWhatsAppQuery(expoConfig),
    // Set by `eas init` (or `eas build:configure`) the first time you run
    // it. EAS CLI can't auto-write this into a dynamic (.js) config file
    // the way it can with a plain app.json, so it's pasted in directly here
    // instead — process.env.EAS_PROJECT_ID still overrides it if set.
    extra: {
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? "0982741a-ec74-4587-983c-97655330be27",
      },
    },
    // Set by `eas update:configure` the first time you run it — same
    // dynamic-config limitation as projectId above, pasted in by hand.
    // Lets an already-installed build fetch new JS/asset bundles instead
    // of needing a full rebuild+reinstall, as long as the change doesn't
    // touch native code (new native modules, permissions, Expo SDK version
    // — those still need `eas build`). "appVersion" runtime policy means
    // an update only applies to installs whose native `version` (in this
    // file, above) matches what the update was published for.
    updates: {
      url: "https://u.expo.dev/0982741a-ec74-4587-983c-97655330be27",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
  },
};
