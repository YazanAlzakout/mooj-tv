import { useEffect } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { Brand } from "@/core/theme/tokens";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

/**
 * Slow-drifting red dots behind a screen's content — a small, deliberately
 * cheap decorative touch (few particles, one native-thread animation each,
 * no re-renders: Reanimated's `useAnimatedStyle` mutates the native view
 * directly). Purely `pointerEvents="none"` background flourish, matches the
 * old app's login screen. Keep the particle count low (8-10) — this is
 * meant to be a light accent, not a heavy effect, especially since it runs
 * continuously for as long as the screen is mounted.
 */
function Particle({ x, size, delay }: { x: number; size: number; delay: number }) {
  const translateY = useSharedValue(SCREEN_HEIGHT + 60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const duration = 5000 + delay * 300;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-100, { duration, easing: Easing.linear }),
        withTiming(SCREEN_HEIGHT + 60, { duration: 0 })
      ),
      -1
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 800 }),
        withTiming(0.5, { duration: Math.max(duration - 1600, 0) }),
        withTiming(0, { duration: 800 })
      ),
      -1
    );
    // Runs once on mount — this animation is meant to loop for the screen's whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.particle, { left: x, width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

/**
 * Positions/sizes are derived from the index, not `Math.random()` — a
 * random value read during render is impure (it would produce different
 * particles on every re-render, and the project's react-hooks lint rules
 * reject it). The golden-ratio offset below scatters them just as well
 * while staying a pure function of the index.
 */
function particleLayout(index: number, count: number, width: number) {
  const jitter = ((index * 0.618033) % 1) * (width / count);
  return {
    x: (width / count) * index + jitter,
    size: 4 + ((index * 3) % 7),
    delay: index,
  };
}

export function FloatingParticles({ count = 8 }: { count?: number }) {
  const { width } = Dimensions.get("window");

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Particle key={i} {...particleLayout(i, count, width)} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  particle: { position: "absolute", backgroundColor: Brand.primary, opacity: 0.5 },
});
