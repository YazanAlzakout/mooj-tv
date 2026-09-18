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

## Everything else

No other native or vendored third-party binaries in this project yet. Standard npm dependencies
carry their own licenses (see each package's own `LICENSE` in `node_modules`); nothing here
overrides or needs special note for those.
