import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Brand, Radii } from "@/core/theme/tokens";

/**
 * A Pressable that also works from a TV remote.
 *
 * On a phone this is an ordinary Pressable and costs nothing: a touch
 * screen never produces a focus event, so the ring never appears. Wherever
 * a D-pad *does* move focus onto it, the ring is drawn — a remote user has
 * no cursor and no touch, and without a visible focus state the screen is
 * unusable however correct the navigation underneath is.
 *
 * `hasTVPreferredFocus` marks the control the remote should land on when a
 * screen opens; exactly one control per screen should set it.
 *
 * Note: the focus ring is drawn as a sibling overlay rather than by
 * swapping the Pressable's own style, so a focus change never re-runs the
 * child's layout — these wrap list rows, and a layout pass per D-pad step
 * is exactly the kind of cost that made scrolling stutter before.
 *
 * The ring view is also **always mounted**, and only its border colour
 * changes. Rendering it conditionally meant every single D-pad step
 * created two native views and destroyed two others — one pair for the row
 * being left, one for the row being entered — and that is view-tree work on
 * the UI thread, in the one moment that has to feel immediate. Measured on
 * the test television, view building on the UI thread was 193 of 206 janky
 * frames while navigating. A colour swap on a view that already exists
 * costs a property update and no layout at all (the ring is
 * `absoluteFill` + `pointerEvents="none"`, so it never participates in
 * layout regardless).
 */
export function Focusable({
  children,
  onPress,
  style,
  hasTVPreferredFocus,
  disabled,
  hitSlop,
  onFocus,
  /**
   * Draws the ring inside a fully rounded control instead of over its
   * corners — for pills and circular icon buttons, where a square ring
   * reads as a mistake.
   */
  round,
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  hitSlop?: number;
  round?: boolean;
  /** Fired when the D-pad moves focus onto this control. */
  onFocus?: () => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={style}
      hitSlop={hitSlop}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
    >
      {children}
      <View
        style={[styles.ring, round && styles.ringRound, focused && styles.ringVisible]}
        pointerEvents="none"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    // Transparent rather than absent: the border box exists at all times so
    // showing the ring is a colour change, never a mount. See above.
    borderColor: "transparent",
    borderRadius: Radii.md,
  },
  ringVisible: { borderColor: Brand.primary },
  ringRound: { borderRadius: Radii.pill },
});
