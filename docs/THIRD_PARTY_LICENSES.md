# Third-party licenses

## FFmpeg MP2 decoder extension (`modules/decoder-ffmpeg-mp2`)

Added to fix silent audio on real IPTV channels using MP2 (MPEG Layer II) — see
docs/CODEC_MATRIX.md and docs/DECISIONS.md.

**Java/Kotlin wrapper** (`FfmpegAudioRenderer`, `FfmpegAudioDecoder`, `FfmpegLibrary`,
`FfmpegDecoderException`): vendored from [androidx/media](https://github.com/androidx/media)'s
`libraries/decoder_ffmpeg` module, tag `1.8.0`. **License: Apache 2.0.**

**Native library** (`libffmpegJNI.so`, statically linking `libavcodec.a`, `libavutil.a`,
`libswresample.a`): built from FFmpeg `release/6.0`
(`scripts/build-ffmpeg-mp2-decoder.sh`) with:
- only the `mp2` decoder enabled (`ENABLED_DECODERS=(mp2)`)
- no `--enable-gpl`
- no `libavformat`/`libavfilter`

**License: LGPL 2.1+.** The build script's intent is an LGPL-only configuration (no GPL
components pulled in), which is the standard basis for bundling FFmpeg in a closed-source app.
That intent is documented here as what was *configured*, not as a completed legal clearance —
the master build prompt (§10.5) is explicit that one configure flag isn't sufficient proof by
itself. **Still open: an actual review of the built `.so`'s linked symbols/license strings, and
of the LGPL relinking obligation as satisfied by JNI dynamic loading, before this is shipped.**

Prebuilt static libs for `arm64-v8a` and `armeabi-v7a` are committed at
`modules/decoder-ffmpeg-mp2/android/src/main/jni/ffmpeg/android-libs/` (ported from the
`albasera-replit` project, where they were built and already verified to compile). No `x86`/
`x86_64` libs exist — this module's own `build.gradle` scopes its native build to just those two
ABIs (see the comment there), matching what real phones/TV boxes use.

## libVLC / VLCKit via `@lunarr/vlc-player` (Apple platforms only)

Added to play live channels on iOS, where AVFoundation refuses this provider's bare progressive
MPEG-TS — see docs/IOS_READINESS.md and `src/playback/engine/`.

**Status first: the pod has never compiled.** There is no `ios/` directory and no iOS build has
ever been made with this dependency, so everything in this section is read off `package.json`,
`react-native.config.js` and the package's own podspec — not off a real link step or a shipped
binary. The Apple builds and the passing `pod install` recorded in docs/IOS_READINESS.md all
predate the dependency.

**React Native binding** (`@lunarr/vlc-player`, `^2.1.1` in `package.json`, resolved to exactly
`2.1.1` in `package-lock.json`): the Swift/Kotlin/Fabric wrapper around libVLC, Fabric
(New Architecture) only. **License: MIT** (`node_modules/@lunarr/vlc-player/LICENSE`,
"Copyright (c) 2016 Brent Vatne, Baris Sencan"). The podspec's `s.license` is that same MIT field
read out of the package's own `package.json` — it describes the wrapper, not the VLC binaries the
pod pulls in.

**Native library**, declared by `react-native-vlc-player.podspec` as a CocoaPods dependency and
*not* vendored here — nothing VLC is committed to this repository; the binary would be fetched
from the CocoaPods trunk at build time. Which binary depends entirely on the platform:

- **iOS: `MobileVLCKit ~> 3.7.3`.**
- **tvOS: `TVVLCKit ~> 3.7.3`** — chosen by regex-matching `platform :tvos` in the Podfile,
  because a single podspec has to serve both platforms (the podspec's own comments explain why a
  second `-tvos` podspec would not work with Expo's autolinker). The podspec declares
  `{ :ios => '15.1', :tvos => '15.1' }`.
- **Android: nothing at all.** `react-native.config.js` sets `platforms: { android: null }` for
  this package, so RN's autolinking never pulls `org.videolan.android:libvlc-all` into the Gradle
  build, and the Android artifact that ships on Google Play is unchanged by this dependency.
  Verified 2026-11-18 rather than assumed: a full `npx expo export --platform android` bundle
  contains zero libVLC strings, with working positive controls in the same check. Why that
  exclusion is not optional — libVLC's own `libc++_shared.so` against the FFmpeg decoder's, and
  MP2 audio — is written out in `react-native.config.js`.

**License: LGPL 2.1 or later.** That is the basis on which proprietary apps ship VLCKit;
docs/IOS_READINESS.md cites one that does.

**Still open: the LGPL relinking obligation, again, and harder here than for FFmpeg.** The
podspec sets `s.static_framework = true`, so MobileVLCKit/TVVLCKit would link *statically* into
the app binary. The relinking provision recorded as still-open for the FFmpeg `.so` above applies
to this too, and the argument available there — that JNI dynamic loading satisfies it — does not
apply to a static link. The licensing note in docs/IOS_READINESS.md reasons from *dynamic*
linking being the standard argument; that is not the configuration this podspec produces. What a
static MobileVLCKit link obliges us to publish, and whether the pod can be built non-statically
at all without breaking the Fabric/Swift header arrangement the podspec's comments describe, has
not been answered by anyone. **It needs answering before an iOS binary is distributed, not
after.**

**Still open: the TLS/crypto stack MobileVLCKit brings with it.** MobileVLCKit bundles its own
TLS/crypto stack — gnutls and libgcrypt — so that `https` and `rtsps` work without the system
one. Those are separate upstream projects with their own license terms. Neither those terms nor
whether bundled crypto changes anything about the App Store encryption/export declaration has
been looked at here.

## Everything else

The native and vendored third-party binaries in this project are the two above: the FFmpeg MP2
decoder on Android, and MobileVLCKit/TVVLCKit on Apple platforms. Standard npm dependencies carry
their own licenses (see each package's own `LICENSE` in `node_modules`); nothing here overrides or
needs special note for those.
