import { useEffect } from "react";
import { View, type ColorValue } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

/**
 * The five glyphs in the bottom tab bar.
 *
 * Drawn from plain views, like the icons on the home screen and for the same
 * reason: there is no monochrome character in Unicode for "a television with
 * two antennas" or "a stack of episodes", the colour emoji that come closest
 * ignore the tint, and pulling an SVG renderer in for five small shapes is
 * not worth the bundle. A handful of bordered boxes costs nothing.
 *
 * Every glyph takes the tint as a prop rather than reading the theme: the tab
 * bar interpolates the colour between the active and inactive states as the
 * selection moves, and a glyph that fetched its own colour would ignore that
 * and snap.
 *
 * All five are built from `size` alone so the bar can be retuned in one
 * place, and all five occupy the same square box so the labels underneath sit
 * on one line however tall a particular shape happens to be.
 */

interface GlyphProps {
  /*
   * `ColorValue`, not `string`: the tab bar animates the tint between its
   * active and inactive values and can hand down a platform colour object
   * rather than a hex string. Narrowing this to `string` would compile
   * only by throwing that away.
   */
  color: ColorValue;
  size: number;
}

/** Shared square so five different shapes still line up with each other. */
function Box({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {children}
    </View>
  );
}

/** A house: a border-drawn roof over an open-topped body. */
export function HomeGlyph({ color, size }: GlyphProps) {
  const w = size * 0.42;
  return (
    <Box size={size}>
      <View
        style={{
          borderLeftWidth: w,
          borderRightWidth: w,
          borderBottomWidth: size * 0.3,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.56,
          height: size * 0.34,
          borderWidth: size * 0.09,
          borderTopWidth: 0,
          borderColor: color,
        }}
      />
    </Box>
  );
}

/** A television: two antennas over a screen. */
export function LiveGlyph({ color, size }: GlyphProps) {
  const antenna = {
    position: "absolute" as const,
    width: size * 0.07,
    height: size * 0.3,
    backgroundColor: color,
    borderRadius: size * 0.04,
  };
  return (
    <Box size={size}>
      <View style={{ width: size * 0.5, height: size * 0.26 }}>
        <View style={[antenna, { left: size * 0.17, transform: [{ rotate: "-32deg" }] }]} />
        <View style={[antenna, { right: size * 0.17, transform: [{ rotate: "32deg" }] }]} />
      </View>
      <View
        style={{
          width: size * 0.82,
          height: size * 0.5,
          borderWidth: size * 0.09,
          borderColor: color,
          borderRadius: size * 0.12,
        }}
      />
    </Box>
  );
}

/**
 * A strip of film: a frame with a sprocket hole top and bottom on each side.
 *
 * Two holes a side rather than the four a real strip has — at tab-bar size
 * four become a grey smear, and the shape stops reading as film at all.
 */
export function MoviesGlyph({ color, size }: GlyphProps) {
  const hole = {
    width: size * 0.11,
    height: size * 0.11,
    backgroundColor: color,
    borderRadius: size * 0.03,
  };
  const column = { justifyContent: "space-between" as const, height: size * 0.44 };
  return (
    <Box size={size}>
      <View
        style={{
          width: size * 0.84,
          height: size * 0.66,
          borderWidth: size * 0.09,
          borderColor: color,
          borderRadius: size * 0.1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: size * 0.06,
        }}
      >
        <View style={column}>
          <View style={hole} />
          <View style={hole} />
        </View>
        <View style={column}>
          <View style={hole} />
          <View style={hole} />
        </View>
      </View>
    </Box>
  );
}

/**
 * A stack of episodes: three cards seen from the front, each narrower than
 * the one in front of it so the stack reads as depth rather than as a list.
 */
export function SeriesGlyph({ color, size }: GlyphProps) {
  return (
    <Box size={size}>
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: size * 0.42,
            height: size * 0.07,
            backgroundColor: color,
            borderRadius: size * 0.04,
            opacity: 0.55,
          }}
        />
        <View
          style={{
            width: size * 0.62,
            height: size * 0.07,
            backgroundColor: color,
            borderRadius: size * 0.04,
            marginTop: size * 0.06,
            opacity: 0.78,
          }}
        />
        <View
          style={{
            width: size * 0.84,
            height: size * 0.42,
            borderWidth: size * 0.09,
            borderColor: color,
            borderRadius: size * 0.1,
            marginTop: size * 0.06,
          }}
        />
      </View>
    </Box>
  );
}

/** Three dots. The one glyph that needs no explaining in any language. */
export function MoreGlyph({ color, size }: GlyphProps) {
  const dot = {
    width: size * 0.16,
    height: size * 0.16,
    borderRadius: size * 0.08,
    backgroundColor: color,
  };
  return (
    <Box size={size}>
      <View style={{ flexDirection: "row", gap: size * 0.12 }}>
        <View style={dot} />
        <View style={dot} />
        <View style={dot} />
      </View>
    </Box>
  );
}

/**
 * The glyph as the tab bar actually renders it: scaled up and lifted a
 * couple of pixels while its tab is the selected one.
 *
 * The bar already interpolates the tint, so without this the only thing
 * that moves when a viewer changes section is a colour — which reads as a
 * screenshot changing rather than as a thing responding. The spring is
 * small on purpose: this fires on every tab press, several times a minute,
 * and anything with real travel in it becomes tiring by the third day.
 *
 * `{ duration, dampingRatio }` is the Reanimated 4 spring form. The older
 * `{ stiffness, damping }` pair still works, but `restDisplacementThreshold`
 * and friends do not — version 4 ignores them in silence, which is how a
 * spring that looked configured sat visibly wrong for a week in the project
 * this was cloned from.
 */
export function AnimatedTabGlyph({
  Glyph,
  color,
  focused,
}: {
  Glyph: (props: GlyphProps) => React.ReactElement;
  color: ColorValue;
  focused: boolean;
}) {
  const lift = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, { duration: 340, dampingRatio: 0.68 });
    // `lift` is a shared value and never changes identity; `focused` is the input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.value * 0.15 }, { translateY: -lift.value * 2 }],
  }));

  return (
    <Animated.View style={style}>
      <Glyph color={color} size={22} />
    </Animated.View>
  );
}
