import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import type { BottomTabBarProps } from "expo-router/js-tabs";

import {
  HomeGlyph,
  LiveGlyph,
  MoreGlyph,
  MoviesGlyph,
  SeriesGlyph,
} from "@/components/TabIcons";
import { useTapFeedback } from "@/core/feedback/useTapFeedback";
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
  const theme = useThemeRerender();
  const C = themeColors();

  /**
   * The light the spotlight is made of, and the ink of the tab it falls on.
   *
   * Both were `#FFFFFF`, written when the only theme anyone looked at was
   * the dark one. On the light theme the bar is #F3F4F6, so the selected
   * glyph was white on near-white and the lamp and cone were invisible:
   * the whole assembly collapsed to the one blue bar at the foot. Reported
   * as "باللايت مود بطل شكلن حلو".
   *
   * A light source cannot be lighter than its ground, so on a light bar it
   * stops being white and becomes the brand blue. That is also what every
   * light-mode tab bar does with its selected item, so nothing here is
   * unusual once the colour is right.
   *
   * The cut-out inside the movies glyph stays dark on both themes: it is a
   * hole in a filled shape, and both white and brand blue are light enough
   * to hold one.
   */
  const dark = theme === "dark";
  const glow = dark ? "#FFFFFF" : Brand.primary;
  const coneWide = dark ? "rgba(62,185,235,0.09)" : "rgba(25,137,198,0.10)";
  const coneCore = dark ? "rgba(255,255,255,0.07)" : "rgba(25,137,198,0.07)";
  const pool = dark ? Brand.primaryLight : Brand.primary;

  const [barWidth, setBarWidth] = useState(0);
  const slide = useSharedValue(0);
  const count = state.routes.length;
  const itemWidth = barWidth > 0 ? barWidth / count : 0;

  /* The tick and the haptic, shared with the More list and Settings. */
  const tap = useTapFeedback();

  /**
   * The width the light was last placed against.
   *
   * Without it, rotating the phone made the spotlight travel. The spring
   * below is driven by `state.index * itemWidth`, and turning the phone
   * changes `itemWidth` without changing the tab — so the light set off
   * across the capsule to the same tab's new position, a 420ms slide
   * nobody asked for, every single rotation. Part of the jolt reported as
   * "في قفزة بالشلاشة ونطقة مو حلوة".
   *
   * A spring is for a tab the viewer pressed. A new geometry is not an
   * event; the light belongs wherever the layout now puts it, at once.
   */
  const placedAt = useRef(0);

  useEffect(() => {
    if (itemWidth === 0) return;
    const target = state.index * itemWidth;
    if (placedAt.current !== itemWidth) {
      placedAt.current = itemWidth;
      slide.value = target;
      return;
    }
    slide.value = withSpring(target, { duration: 420, dampingRatio: 0.82 });
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
      tap();

      const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    },
    [tap, navigation, state.index, state.routes]
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
            <View style={[styles.lamp, { backgroundColor: glow }]} />
            {/* The cone: wide and faint under narrow and brighter. */}
            <View style={[styles.coneWide, { borderBottomColor: coneWide }]} />
            <View style={[styles.coneCore, { borderBottomColor: coneCore }]} />
            {/* Where the light lands. */}
            <View style={[styles.pool, { backgroundColor: pool }]} />
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
              <Glyph color={focused ? glow : C.textMuted} size={23} focused={focused} />
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

  /*
   * Geometry only, from here down. Every colour in the spotlight depends on
   * which theme is up, and a stylesheet cannot ask — see the note in the
   * component.
   */
  lamp: {
    width: LAMP_WIDTH,
    height: LAMP_HEIGHT,
    borderRadius: LAMP_HEIGHT,
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
  },
  pool: {
    position: "absolute",
    bottom: 0,
    width: 30,
    height: LAMP_HEIGHT,
    borderRadius: LAMP_HEIGHT,
  },
});

/** Kept out of the component: the palette type is only needed for the cast above. */
export type { ThemeColors };
