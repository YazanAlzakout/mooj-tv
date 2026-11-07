import { useEffect } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Brand } from "@/core/theme/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/**
 * The backdrop's slow swell: three very wide, very faint ellipses drifting
 * across each other behind a screen's content.
 *
 * ## Why not the dots it replaces
 *
 * The screen used to carry eight small circles rising from the bottom edge
 * to the top on a loop. Two things were wrong with them. They repeated
 * visibly — eight identical shapes on one path, so the eye found the cycle
 * in seconds and then could not unsee it. And they were generic: dots
 * rising belong to no particular app, and this one is named for waves.
 *
 * These read as water instead, and they are the brand's own shape: wide
 * flat curves, layered, each moving at its own pace so they never line up
 * into a pattern you can count.
 *
 * ## Why it is cheaper than what it replaces
 *
 * Three views instead of eight, each with one transform-only animation on
 * the native thread. Nothing re-renders — Reanimated mutates the view
 * directly — and no opacity is animated, which is what made the old dots
 * cost a full-screen re-blend on every frame.
 *
 * Each band reverses rather than restarting: `withRepeat(..., -1, true)`
 * runs the timing forwards and then backwards for ever, so there is no
 * frame where a shape jumps back to where it started. The dots did jump,
 * hidden behind a fade, and hiding it is what cost the opacity animation.
 *
 * ## Deliberately absent on television
 *
 * `ScreenBackground` never mounts this on the TV build, for the reason
 * written there: a set-top box has to find these frames while also moving a
 * focus ring in response to a remote, and they come out of the remote. A
 * decoration nobody can see from three metres is the worst trade available.
 */

interface BandProps {
  /** Fraction of the screen height the band's centre sits at. */
  top: number;
  /** Multiple of the screen width — always over 1, so the ends never show. */
  width: number;
  height: number;
  color: string;
  /** One full sweep, in milliseconds. Different per band, and never a multiple of another. */
  duration: number;
  /** How far it travels, in pixels, from its resting position. */
  travel: number;
  /** Negative starts it on the other side, so the three never set off together. */
  direction: 1 | -1;
}

function Band({ top, width, height, color, duration, travel, direction }: BandProps) {
  const drift = useSharedValue(-travel * direction);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(travel * direction, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    // Runs once on mount; the band drifts for as long as the screen is up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: drift.value }] }));

  const w = SCREEN_WIDTH * width;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.band,
        {
          top: `${top * 100}%`,
          left: (SCREEN_WIDTH - w) / 2,
          width: w,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Three bands, and three is the number on purpose: two read as a pattern,
 * four start to muddy the text sitting over them.
 *
 * The durations are deliberately not multiples of one another — 23, 31 and
 * 41 seconds — so the three only return to the same arrangement once every
 * several hours rather than every half minute.
 */
export function WaveBands() {
  return (
    <>
      <Band top={0.08} width={1.9} height={260} color={Brand.wave.deep} duration={41000} travel={46} direction={1} />
      <Band top={0.34} width={1.6} height={200} color={Brand.wave.mid} duration={31000} travel={62} direction={-1} />
      <Band top={0.62} width={2.1} height={320} color={Brand.wave.soft} duration={23000} travel={38} direction={1} />
    </>
  );
}

const styles = StyleSheet.create({
  /* No container opacity: the alpha lives in the colour, so one value
     decides how visible a band is rather than two multiplying. */
  band: { position: "absolute" },
});
