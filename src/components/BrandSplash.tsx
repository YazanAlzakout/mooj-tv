import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";

import { brandLogoSource } from "./BrandLogo";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

/** Hard ceiling — the app must never be gated on the intro clip finishing, or failing to. */
const MAX_SPLASH_MS = 2600;

/**
 * Brand intro clip, played once over the app's own background while fonts,
 * the database and the session restore finish in parallel behind it. The
 * logo sits underneath the video, so if the clip fails to decode on a given
 * device there's still a branded frame rather than a black screen.
 *
 * `onFinish` is called exactly once — whichever comes first, the clip
 * ending or `MAX_SPLASH_MS` — so a stalled or unsupported video can never
 * strand the user on the splash.
 */
export function BrandSplash({ onFinish }: { onFinish: () => void }) {
  const finishedRef = useRef(false);

  const player = useVideoPlayer(require("../../assets/images/splash-vid.mp4"), (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  function finishOnce() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish();
  }

  useEventListener(player, "playToEnd", () => finishOnce());
  useEventListener(player, "statusChange", ({ status }) => {
    // A clip that can't be decoded on this device shouldn't hold the app —
    // fall through to the logo frame and let the timer below finish.
    if (status === "error") finishOnce();
  });

  useEffect(() => {
    const timer = setTimeout(finishOnce, MAX_SPLASH_MS);
    return () => clearTimeout(timer);
    // Arms the one hard timeout on mount; `finishOnce` is idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View exiting={FadeOut.duration(280)} style={styles.root}>
      <View style={styles.logoLayer} pointerEvents="none">
        <View style={styles.logoGlow} />
        <Image
          source={brandLogoSource()}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </Animated.View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: C.background },
  logoLayer: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  logoGlow: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(229,9,20,0.16)",
  },
  logo: { width: 180, height: 100 },
  })
);
