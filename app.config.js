const isTV = process.env.EXPO_TV === "1";

/*
 * Every value that makes this build Mooj TV rather than some other brand.
 * One object, one file, shared with the runtime through
 * `src/core/brand/index.ts` — see the note at the top of brand.config.js
 * for why it is not spread over the places it is used.
 */
const BRAND = require("./brand.config.js");

/**
 * **A build that installs beside the published app instead of replacing it.**
 *
 * Google Play re-signs every upload with its own app-signing key, while a
 * build made here is signed with the upload key. Android treats a different
 * signature as a different app and refuses to update across it — so a
 * sideloaded test build on a phone that has the store copy fails with
 * `INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match`, silently
 * leaving the old app in place. Measured on the owner's own phone,
 * 2026-10-05, while trying to test a fix.
 *
 * The only ways out are to uninstall the store copy — which erases the saved
 * provider, the library and the watch history with it — or to let the test
 * build be a different app. This is the second. Set `MOOJ_DEV_ID=1` and
 * the build takes its own id, its own launcher label and its own URL scheme,
 * so both copies live on one phone and the real one is never touched.
 *
 * **It must never reach Play.** A build carrying this id is not the app:
 * it has no listing, no reviews and no users. `npm run prebuild` without the
 * variable puts everything back — and because the id also decides the Kotlin
 * package on disk (see the note on the build command below), that is not
 * optional bookkeeping, it is how the production build is produced at all.
 *
 * Two things do not follow the id, and both are accepted rather than fixed:
 * the dev-client scheme `exp+mooj-tv` comes from `slug`, which is
 * tied to the EAS project, so "open in development build" may offer a choice
 * when both copies are installed; and the 1.x provider import
 * (`legacyProviderImport.ts`) reads the *old published app's* SecureStore,
 * which only exists under the production id — that one migration path can
 * only be tested on a build carrying it.
 */
const isDevId = process.env[BRAND.devEnvVar] === "1";

/*
 * The live app id, and the one value here that can never be taken back: a
 * changed package id after publication is a different app to Play, with its
 * own listing, its own install base and its own reviews. Chosen 2026-11-07,
 * while nothing was published and it was still free to choose.
 *
 * The value lives in brand.config.js because it is brand identity rather
 * than build configuration.
 */
const ANDROID_PACKAGE = isDevId ? BRAND.packageId + ".dev" : BRAND.packageId;

/*
 * Play orders releases by this number and refuses an upload carrying one it
 * has already seen — on any track, not only production.
 *
 * This app has never been published, so it starts at 1 with the whole range
 * ahead of it. Nothing increments it automatically: the project builds
 * natively rather than through EAS, so it is raised here by hand for every
 * upload.
 *
 * One rule is carried over from the project this was cloned from, because
 * it was learned the expensive way: **a free versionCode is read from App
 * bundle explorer in Play Console, never inferred from the repository.**
 * There, a number looked unused because no commit mentioned it, and Play
 * refused the upload — a build had reached a test track and left no trace
 * in git.
 */
const VERSION_CODE_BASE = 1;

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
     * The launcher label. Both halves come from brand.config.js, so a
     * further brand needs no edit in this file at all.
     */
    /* A sideload copy says so on the home screen, or the tester cannot tell the two apart. */
    name: isDevId
      ? (isTV ? BRAND.displayNameTv : BRAND.displayName) + " (dev)"
      : isTV
        ? BRAND.displayNameTv
        : BRAND.displayName,
    slug: BRAND.slug,
    /*
     * The version the store shows. It moves with every upload and it is for
     * people to read — `versionCode` below is the number Play actually
     * orders releases by.
     *
     * Nothing is published yet, so this is the first one.
     */
    version: "1.0",
    orientation: isTV ? "landscape" : "default",
    icon: "./assets/images/icon.png",
    /*
     * Branched with the id: two installed copies claiming one scheme make
     * Android stop resolving `moojtv://` to either of them — it
     * offers a chooser, or picks whichever it likes, so a deep link tested
     * on the sideload build opens the store copy half the time.
     */
    scheme: isDevId ? BRAND.scheme + "dev" : BRAND.scheme,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,

    android: {
      package: ANDROID_PACKAGE,
      versionCode: ANDROID_VERSION_CODE,
      /*
       * SYSTEM_ALERT_WINDOW — "Display over other apps" — was in the merged
       * manifest and nothing in this app has ever asked for it. It arrives
       * from a library's own manifest and merges in silently.
       *
       * It is not an ordinary permission. Play lists it under special app
       * access, Android shows it on its own settings page, and an IPTV
       * player that can draw over other apps is exactly the shape of thing
       * a reviewer looks twice at. Nothing here draws a bubble or an
       * overlay outside its own window.
       *
       * `blockedPermissions` is what removes one. `permissions: []` does
       * not subtract — it only adds — so the list has to be blocked by
       * name, which @expo/config-plugins turns into a
       * `tools:node="remove"` entry that survives the merge.
       */
      blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"],
      adaptiveIcon: {
        // Matches the published app exactly, icon assets included: this
        // release replaces it on Play, and an updating user should find the
        // same icon in the same place on their home screen.
        backgroundColor: BRAND.adaptiveIconBackground,
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
        /*
         * The tab bar plays a short click. Nothing else in this app records
         * or plays audio outside the video players, which carry their own.
         *
         * `enableBackgroundPlayback` is switched off, and that is the whole
         * reason this is configured by hand rather than left as the bare
         * string the installer suggests: the default is **true**, which adds
         * a media foreground service and its notification to the manifest.
         * A player that holds a foreground service it never uses is asking
         * Play to explain why, and asking the viewer to look at a
         * notification for a sound that lasts 70 milliseconds.
         */
        "expo-audio",
        {
          enableBackgroundPlayback: false,
          /*
           * And no microphone. The plugin adds RECORD_AUDIO unless this is
           * explicitly false — it supports recording as well as playback,
           * and assumes an app installing it wants both. This one plays a
           * 70ms click. A player asking for the microphone puts
           * "Microphone" on its Play listing and invites a question from
           * review that has no good answer.
           */
          recordAudioAndroid: false,
        },
      ],
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
      /*
       * The runtime half of brand.config.js, baked into the manifest at
       * build time.
       *
       * Read it through src/core/brand/index.ts and never from here
       * directly: `Constants.expoConfig` can come back null, and a brand
       * value arriving as `undefined` would be worse than wrong — an
       * undefined database name opens a different database, and the
       * viewer's whole library appears to have vanished. That module
       * carries literal fallbacks for exactly that case, and
       * tools/verify-brand.js proves the two still agree.
       */
      brand: {
        key: BRAND.key,
        displayName: BRAND.displayName,
        wordmark: BRAND.wordmark,
        databaseName: BRAND.databaseName,
      },
    },
  },
};
