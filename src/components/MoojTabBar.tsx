import * as Haptics from "expo-haptics";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import type { BottomTabBarProps } from "expo-router/js-tabs";

import {
  HomeGlyph,
  LiveGlyph,
  MoreGlyph,
  MoviesGlyph,
  SeriesGlyph,
} from "@/components/TabIcons";
import type { ThemeColors } from "@/core/theme/palettes";
import { themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { Brand } from "@/core/theme/tokens";

/**
 * The bottom bar: a floating capsule with a spotlight over whichever tab is
 * open.
 *
 * ## What it is doing
 *
 * A short bright bar sits on the top edge above the selected icon, a cone of
 * light widens downward from it onto that icon, and a second bar catches the
 * light at the foot. The whole assembly slides to the tab you press. It is a
 * lamp pointed at where you are, and it reads from the corner of the eye in
 * a way that a tinted glyph never did — which was the complaint about the
 * bar this replaces.
 *
 * ## How the cone is drawn without a gradient
 *
 * React Native has no `clip-path` and this project carries no SVG renderer,
 * so the trapezoid is made of borders: a view with a real width, transparent
 * left and right borders and a coloured bottom one comes out as a trapezoid
 * whose top is the width and whose bottom is the width plus both borders.
 * The same trick draws the roof on the home glyph and the play mark on the
 * movies one.
 *
 * Two cones are stacked rather than one, a wide faint one under a narrow
 * brighter one, because a single flat shape reads as a paper cut-out. Two
 * is enough to suggest a beam falling off at the edges; a third is not
 * visible at this size.
 *
 * ## No labels
 *
 * The design this follows has none, and five glyphs across a phone leave no
 * room for Arabic ones at a legible size. Every item still carries an
 * `accessibilityLabel`, so a screen reader announces the same words the old
 * bar printed.
 */

/** The glyph for each route, by file name. Anything unlisted gets the dots. */
const GLYPHS: Record<string, typeof HomeGlyph> = {
  home: HomeGlyph,
  "live-categories": LiveGlyph,
  "movies-categories": MoviesGlyph,
  "series-categories": SeriesGlyph,
  more: MoreGlyph,
};

const BAR_HEIGHT = 62;
const BEAM_TOP_WIDTH = 20;
const LAMP_WIDTH = 22;
const LAMP_HEIGHT = 3;

export function MoojTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  useThemeRerender();
  const C = themeColors();

  const [barWidth, setBarWidth] = useState(0);
  const slide = useSharedValue(0);
  const count = state.routes.length;
  const itemWidth = barWidth > 0 ? barWidth / count : 0;

  /*
   * The click is loaded once and re-fired with seekTo(0), which is the
   * pattern the SDK 57 docs give. A player per press would allocate a
   * decoder on the thread that draws the screen, several times a minute.
   */
  const click = useAudioPlayer(require("../../assets/sounds/tab-tap.m4a"));

  useEffect(() => {
    /*
     * `mixWithOthers` so an 85ms tick never takes audio focus — without it
     * Android pauses whatever the viewer was listening to, for a sound
     * shorter than the gap between two words.
     *
     * `playsInSilentMode: false` so a phone set to silent stays silent.
     * Somebody who has silenced their phone has already answered the
     * question of whether they want to hear this.
     */
    setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: false }).catch(
      () => {
        /* An audio mode this app can live without; the tick simply may duck. */
      }
    );
  }, []);

  useEffect(() => {
    if (itemWidth === 0) return;
    slide.value = withSpring(state.index * itemWidth, { duration: 420, dampingRatio: 0.82 });
    // `slide` is a shared value and never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.index, itemWidth]);

  const beamStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value }] }));

  const press = useCallback(
    (index: number) => {
      const route = state.routes[index];
      const focused = state.index === index;

      /*
       * Feedback first, navigation second. Both are cheap, but the tick is
       * what makes the press feel acknowledged, and firing it after a
       * navigation that remounts a screen puts it on the far side of that
       * work.
       */
      click.seekTo(0);
      click.play();
      if (Platform.OS === "android") {
        Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_On).catch(() => {});
      } else {
        Haptics.selectionAsync().catch(() => {});
      }

      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    },
    [click, navigation, state.index, state.routes]
  );

  return (
    <View
      style={[
        styles.shell,
        {
          /*
           * The capsule floats, so it needs the gesture area under it rather
           * than inside it — otherwise the bar sits on the system handle and
           * the last few pixels of every press go to Android.
           */
          paddingBottom: (insets.bottom > 0 ? insets.bottom : 10) + 6,
          backgroundColor: C.background,
        },
      ]}
    >
      <View
        style={[styles.bar, { backgroundColor: C.surface, borderColor: C.border }]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.beamSlot, { width: itemWidth }, beamStyle]}
          >
            {/* The lamp on the top edge. */}
            <View style={styles.lamp} />
            {/* The cone: wide and faint under narrow and brighter. */}
            <View style={styles.coneWide} />
            <View style={styles.coneCore} />
            {/* Where the light lands. */}
            <View style={styles.pool} />
          </Animated.View>
        )}

        {state.routes.map((route, index) => {
          const Glyph = GLYPHS[route.name] ?? MoreGlyph;
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          return (
            <Pressable
              key={route.key}
              onPress={() => press(index)}
              style={styles.item}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.title ?? route.name}
            >
              <Glyph
                color={focused ? "#FFFFFF" : C.textMuted}
                size={23}
                focused={focused}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { paddingHorizontal: 18, paddingTop: 8 },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: 1,
    overflow: "hidden",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", height: "100%" },

  beamSlot: { position: "absolute", top: 0, bottom: 0, left: 0, alignItems: "center" },

  lamp: {
    width: LAMP_WIDTH,
    height: LAMP_HEIGHT,
    borderRadius: LAMP_HEIGHT,
    backgroundColor: "#FFFFFF",
  },
  /*
   * Trapezoids. `width` is the top edge; the transparent side borders widen
   * it as it falls, and the coloured bottom border is the height. See the
   * note at the top for why there is no gradient here.
   */
  coneWide: {
    position: "absolute",
    top: LAMP_HEIGHT,
    width: BEAM_TOP_WIDTH,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderBottomWidth: BAR_HEIGHT - LAMP_HEIGHT * 2,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(62,185,235,0.09)",
  },
  coneCore: {
    position: "absolute",
    top: LAMP_HEIGHT,
    width: BEAM_TOP_WIDTH - 8,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: BAR_HEIGHT - LAMP_HEIGHT * 2,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  pool: {
    position: "absolute",
    bottom: 0,
    width: 30,
    height: LAMP_HEIGHT,
    borderRadius: LAMP_HEIGHT,
    backgroundColor: Brand.primaryLight,
  },
});

/** Kept out of the component: the palette type is only needed for the cast above. */
export type { ThemeColors };
