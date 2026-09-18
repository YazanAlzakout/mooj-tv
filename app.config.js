const isTV = process.env.EXPO_TV === "1";

/*
 * The live app id. Resolved 2026-09-04: this release replaces the app
 * already published on Google Play rather than going out as a new listing,
 * and the package id is the app's identity on Play — it cannot be changed
 * after publication, so it has to match the existing one exactly.
 */
const ANDROID_PACKAGE = "com.albasera.player";

/*
 * Must be strictly greater than every versionCode ever uploaded to Play,
 * across all tracks — not just production.
 *
 * Read from Play Console on 2026-09-04: production is on 6, and an Android
 * TV internal-test build had already taken 7, which was the highest in use.
 * Starting 2.0 at 10 clears both with room to spare, so an upload is never
 * rejected over a code claimed by a track that is easy to forget about.
 *
 * Nothing increments this automatically. The published app left it to EAS
 * (`appVersionSource: "remote"` with `autoIncrement`), which kept the number
 * on EAS's servers rather than in the repository; this project builds
 * natively, so it is bumped here by hand for every release.
 */
/*
 * Bumped by two each release so the phone/TV pair never collides with the
 * previous pair. 10/11 are on Play (10 in production, 11 on the Android TV
 * open-testing track). 12/13 were built and sideloaded for testing but
 * never uploaded, so those numbers are still free on Play. 14/15 was built
 * and sideloaded on the test television; this pair is 16/17, so `dumpsys
 * package` can always say which build a device is actually running —
 * checking that number caught a build that had silently never produced an
 * APK at all.
 */
const VERSION_CODE_BASE = 20;

/*
 * Phone and TV are one app on Play — same listing, same package id, with
 * Android TV as a form factor rather than a separate product — but they
 * are two different artifacts, and Play refuses two artifacts sharing a
 * versionCode in one release. So the TV build takes the next number up.
 *
 * Keep the step at 1 and move `VERSION_CODE_BASE` by 2 each release, so
 * the pair never collides with the next release's pair.
 */
const ANDROID_VERSION_CODE = isTV ? VERSION_CODE_BASE + 1 : VERSION_CODE_BASE;

module.exports = {
  expo: {
    /*
     * The launcher label, and deliberately not "… 2": the 2.0 is a version,
     * not a new identity. This release replaces the published app on the
     * same package id, so the name its existing users already have on their
     * home screen is the one that should stay there — a renamed icon reads
     * as a different app, not as an update.
     */
    name: isTV ? "AlBasera Player TV" : "AlBasera Player",
    slug: "albasera-player-v2",
    /*
     * The version the store shows, and it must move with every upload.
     *
     * Play already has a public release called **2.0** (versionCode 10,
     * published 4 September 2026). Play will happily accept a second upload
     * carrying the same name, and then the listing shows "2.0" twice with
     * nothing to tell a customer which one they have — so the name is
     * raised even though the work in this release is not a new major
     * version.
     *
     * Not to be confused with `versionCode` below, which is the number Play
     * actually orders releases by. That one is 16 for the phone and 17 for
     * the television, both comfortably above the published 10.
     */
    version: "2.1",
    orientation: isTV ? "landscape" : "default",
    icon: "./assets/images/icon.png",
    scheme: "albaseraplayer2",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    android: {
      package: ANDROID_PACKAGE,
      versionCode: ANDROID_VERSION_CODE,
      adaptiveIcon: {
        // Matches the published app exactly, icon assets included: this
        // release replaces it on Play, and an updating user should find the
        // same icon in the same place on their home screen.
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      intentFilters: isTV
        ? [{ action: "MAIN", category: ["LEANBACK_LAUNCHER"] }]
        : undefined,
      /*
       * No `usesFeatures` here: it is not an Expo config key and prebuild
       * ignores it. The manifest's <uses-feature> entries come from
       * @react-native-tvos/config-tv below, and the block that used to sit
       * here claimed leanback was optional — the opposite of what the TV
       * build actually needs.
       */
    },

    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      "expo-image",
      "expo-secure-store",
      "expo-sqlite",
      "expo-localization",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          // Must exactly match Colors.background (src/core/theme/tokens.ts) —
          // this is the native splash screen's background, and any mismatch
          // with the JS screen that appears right after it (the startup gate,
          // src/app/index.tsx) reads as a visible flash at handoff.
          backgroundColor: "#0A0A0F",
        },
      ],
      [
        "expo-video",
        {
          // Both need manifest entries, so they are enabled here rather than
          // at runtime. Background playback is still opt-in per user in
          // Settings (it keeps the provider connection held), and
          // picture-in-picture only ever starts from the player screen.
          supportsBackgroundPlayback: true,
          supportsPictureInPicture: true,
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            // Real IPTV panels are frequently plain HTTP. This is a
            // deliberate, documented choice — see docs/DECISIONS.md.
            usesCleartextTraffic: true,
            minSdkVersion: 26,
            packagingOptions: {
              pickFirst: ["**/libc++_shared.so"],
            },
          },
        },
      ],
      // Wires modules/decoder-ffmpeg-mp2 (vendored from androidx/media, Apache
      // 2.0, LGPL-safe FFmpeg build with only the MP2 decoder enabled) into
      // Media3 as a fallback audio renderer, so MP2 live channels — confirmed
      // present on the real test provider, see docs/CODEC_MATRIX.md — decode
      // instead of playing silently. See patches/expo-video+*.patch for the
      // two lines this depends on inside expo-video itself.
      "./plugins/withDecoderFfmpegMp2",
      "./plugins/withReleaseSigning",
      "./plugins/withGradleMemory",
      /*
       * `enforceContrast: false` is load-bearing, not a preference.
       *
       * Android's default under edge-to-edge is to paint a translucent
       * scrim behind the navigation bar so its icons stay legible whatever
       * is underneath. That scrim also makes the app's own `style` request
       * a no-op — expo-navigation-bar documents the button style as having
       * an effect only when this is off. With it on, a light theme kept
       * white icons over a grey band at the bottom of every screen; with it
       * off the bar is genuinely transparent and the app owns the icon
       * colour, which is what src/app/_layout.tsx sets from the theme.
       */
      ["expo-navigation-bar", { enforceContrast: false }],

      /*
       * `androidTVRequired: true` is load-bearing for the Play release, not
       * a preference. Without it the plugin declares leanback as *not*
       * required, so the TV build accepts every device the phone build
       * does — and since it also carries the higher versionCode, Play
       * treats the phone build as fully shadowed and rejects it. With it,
       * the two device sets are disjoint and both artifacts can ship in
       * one release.
       */
      ...(isTV
        ? [
            [
              "@react-native-tvos/config-tv",
              {
                androidTVRequired: true,
                /*
                 * Required for the Leanback launcher, and Play's Android TV
                 * form-factor review rejects an app without one. 320x180 at
                 * xhdpi, built from the brand lockup on white.
                 */
                androidTVBanner: "./assets/images/tv-banner.png",
              },
            ],
          ]
        : []),
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      /*
       * Whether this binary is the Android TV one. Read through
       * src/core/platform/isTvBuild.ts.
       *
       * This exists because `Platform.isTV` cannot be trusted. It resolves
       * to `uiMode === UI_MODE_TYPE_TELEVISION`, and a great many Android
       * TV boxes — including the one this app is actually tested on —
       * report `normal` instead. Gating TV behaviour on it silently
       * disabled every TV feature on exactly the hardware they were written
       * for: twice, now, and the second time the category rail simply never
       * appeared and the screen looked like the phone build.
       *
       * The phone and the TV are separate artifacts built from separate
       * prebuilds (`EXPO_TV=1`), so which one is running is settled at build
       * time and does not need sniffing at runtime at all. This is that
       * answer, baked into the manifest.
       */
      isTvBuild: isTV,
      eas: {
        projectId: "79a3df7f-90b8-4285-833a-ac8ef62b8683",
      },
    },
  },
};
