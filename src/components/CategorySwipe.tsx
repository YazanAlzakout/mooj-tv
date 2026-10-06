import { useCallback, useEffect } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Changing category by dragging the content sideways, on every browse
 * screen (2026-10-06).
 *
 * The strip of chips at the top stays exactly as it was; this is a second
 * way to reach the same thing, for a thumb that is already on the list.
 *
 * ## Why it does not fight the vertical scroll
 *
 * This is the whole difficulty, and it is why the gesture is built with
 * `react-native-gesture-handler` rather than the responder system the
 * player's own gestures use. A `FlatList` is a native scroll view: once it
 * has decided a touch is a scroll it keeps it, and the responder system
 * cannot take it back cleanly. `activeOffsetX` / `failOffsetY` settle the
 * question *before* either side commits — the pan only becomes active after
 * a clear sideways movement, and is cancelled outright the moment the
 * finger moves vertically first. One of the two always wins, immediately,
 * and never both.
 *
 * ## The distances
 *
 * Android defines 160 dp as one inch, so a centimetre is about 63 dp. The
 * viewer asked for a deliberate drag of roughly one to one and a half
 * centimetres rather than a twitch, which is `COMMIT_DISTANCE` below. The
 * other three numbers exist to make that one feel right: the gesture takes
 * over well before the commit point so the movement is visible while it is
 * being made, a fast flick is allowed to stand in for the distance but only
 * once it has travelled far enough not to be an accident, and a drag that
 * stops short springs back so nothing happens by halves.
 *
 * ## The transition
 *
 * The content follows the finger, then leaves in the direction it was
 * going, fading as it goes; the data changes while it is invisible, and it
 * returns from the opposite side. **One list exists at any moment** — a
 * true sliding pager would hold two lists of up to twenty thousand rows
 * alive at once, on the screens this project has twice had to repair for
 * stuttering. Fading through zero also makes the swap untimed: it does not
 * matter which frame React commits the new data on, because nothing is on
 * screen to see it.
 *
 * The transform and the opacity are Reanimated shared values, so the drag
 * and both halves of the transition run on the UI thread and the JavaScript
 * thread is touched exactly twice per change — once to commit the category,
 * once when the animation ends.
 */

/** Sideways travel before the pan takes the touch from the list. */
const ACTIVATE_X = 24;
/** Vertical travel that cancels the pan outright — this touch is a scroll. */
const FAIL_Y = 12;
/** The deliberate drag: about 1.15 cm at Android's 160 dp to the inch. */
const COMMIT_DISTANCE = 72;
/** A flick may stand in for the distance, but only past this speed… */
const COMMIT_VELOCITY = 900;
/** …and only once it has gone at least this far, so a twitch never counts. */
const FLICK_MIN_DISTANCE = 40;
/** How far the content may follow the finger. Beyond this it stops moving. */
const MAX_FOLLOW = 90;
/** How far it travels on its way out, after the finger lets go. */
const EXIT_DISTANCE = 48;

const OUT_MS = 120;
const IN_MS = 170;
const RETURN_MS = 160;

/**
 * Resistance at the ends of the strip.
 *
 * With no category to go to, the content still moves — doing nothing at all
 * reads as a broken gesture — but only a third as far, which says "there is
 * nothing this way" without a message.
 */
const EDGE_RESISTANCE = 3;

export function CategorySwipe({
  ids,
  activeId,
  onSelect,
  isRTL,
  enabled = true,
  style,
  children,
}: {
  /** Every category in strip order, including whatever "All" chip the screen puts first. */
  ids: string[];
  activeId: string;
  onSelect: (id: string) => void;
  /** From `useI18n()`, so the direction matches the strip the viewer is looking at. */
  isRTL: boolean;
  /** False while the screen has nothing to show — a loading or error state. */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  /*
    The gesture runs on the UI thread, where it cannot read React state. The
    two numbers it needs are mirrored into shared values after every render
    instead; writing them from an effect rather than during render is what
    `react-hooks/refs` asks for, and the cost is two assignments.
  */
  const index = ids.indexOf(activeId);
  const indexValue = useSharedValue(index);
  const countValue = useSharedValue(ids.length);
  useEffect(() => {
    indexValue.value = index;
    countValue.value = ids.length;
  }, [index, ids.length, indexValue, countValue]);

  /**
   * Which way is "next".
   *
   * The chips are laid out in the reading direction, so in Arabic the next
   * chip sits to the *left* of the current one and the drag that brings it
   * in is a drag to the right — the same convention every paged interface
   * uses, mirrored. Taking the direction from the app's own locale rather
   * than from `I18nManager` keeps it in step with the strip above, which is
   * drawn from the same source.
   */
  const step = useCallback(
    (direction: 1 | -1) => {
      const next = ids.indexOf(activeId) + direction;
      if (next < 0 || next >= ids.length) return;
      onSelect(ids[next]);
    },
    [ids, activeId, onSelect]
  );

  /** Called on the UI thread when the content has left the screen. */
  const commit = useCallback(
    (direction: 1 | -1) => {
      step(direction);
    },
    [step]
  );

  const pan = Gesture.Pan()
    .enabled(enabled && ids.length > 1)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onUpdate((event) => {
      "worklet";
      const forward = isRTL ? event.translationX > 0 : event.translationX < 0;
      const direction: 1 | -1 = forward ? 1 : -1;
      const target = indexValue.value + direction;
      const blocked = target < 0 || target >= countValue.value;
      const travel = Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, event.translationX));
      translateX.value = blocked ? travel / EDGE_RESISTANCE : travel;
      /* Barely perceptible while dragging; the real fade happens on the way out. */
      opacity.value = 1 - Math.min(0.15, Math.abs(translateX.value) / 600);
    })
    .onEnd((event) => {
      "worklet";
      const distance = Math.abs(event.translationX);
      const flicked = Math.abs(event.velocityX) > COMMIT_VELOCITY && distance > FLICK_MIN_DISTANCE;
      const forward = isRTL ? event.translationX > 0 : event.translationX < 0;
      const direction: 1 | -1 = forward ? 1 : -1;
      const target = indexValue.value + direction;
      const blocked = target < 0 || target >= countValue.value;

      if (blocked || (distance < COMMIT_DISTANCE && !flicked)) {
        translateX.value = withTiming(0, { duration: RETURN_MS });
        opacity.value = withTiming(1, { duration: RETURN_MS });
        return;
      }

      const exit = event.translationX < 0 ? -EXIT_DISTANCE : EXIT_DISTANCE;
      opacity.value = withTiming(0, { duration: OUT_MS });
      translateX.value = withTiming(exit, { duration: OUT_MS }, (finished) => {
        "worklet";
        if (!finished) return;
        /*
          The swap happens here, with nothing on screen: the category
          changes, the list re-renders and its remembered scroll position is
          restored, all at opacity zero. Then the content returns from the
          side the new category came from.
        */
        runOnJS(commit)(direction);
        translateX.value = -exit;
        translateX.value = withTiming(0, { duration: IN_MS });
        opacity.value = withTiming(1, { duration: IN_MS });
      });
    });

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style, animated]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/** Exported for the screens' own measurements and for anything that needs the same feel. */
export const CATEGORY_SWIPE_COMMIT_DISTANCE: number = COMMIT_DISTANCE;

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

/** Reanimated's own type, re-exported so screens need not import the library for one annotation. */
export type { SharedValue };
