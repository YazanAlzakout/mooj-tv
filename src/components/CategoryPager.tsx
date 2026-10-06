import { useEffect, useRef } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

/**
 * Categories as pages you can see past the edge of (2026-10-07).
 *
 * The category either side of the one you are on is **mounted and on
 * screen**, just off the edge, so a drag reveals it travelling in rather
 * than swapping the content once the finger lifts. This is what a paged
 * interface does everywhere else on the phone, and the viewer was right to
 * expect it.
 *
 * ## Why this replaces `CategorySwipe`, and why that one was wrong
 *
 * `CategorySwipe` moved a single list, faded it out, changed the data behind
 * it and faded it back. Its own comment defended that: a real pager "would
 * hold two lists of up to twenty thousand rows alive at once", on screens
 * this project has twice repaired for stuttering.
 *
 * **That number was wrong, and it is worth being precise about how.** A
 * `FlatList` is virtualized: it mounts the cells in its window — fifteen or
 * so — and never the twenty thousand rows behind them. Three pages is
 * therefore about forty-five mounted cells, not sixty thousand, and forty-five
 * is the order of what one page costs. Android's own ViewPager2 keeps exactly
 * this window for exactly this reason. The caution was real; the figure it
 * rested on was not, and it kept the obvious interaction out of the app.
 *
 * ## The handover
 *
 * Each page is placed by its distance from the current one — minus one, nought,
 * plus one, times the screen width — and the whole row is offset by the drag.
 * When a drag commits, the row settles at exactly one screen width, and *then*
 * the category changes: the window re-centres, every page's own offset shifts
 * by one, and the row returns to nought. The page that was at plus one is now
 * at nought, which is the same pixel it already occupied. Nothing moves at the
 * moment of the swap, so there is no frame to get wrong and no ordering to
 * arrange between React and the UI thread.
 *
 * Because the page arriving is the real list, already laid out and already
 * scrolled where the viewer left it, it is finished before it arrives: it can
 * be scrolled the instant it lands, with nothing to fetch, render or restore.
 *
 * ## Direction
 *
 * A drag to the left always goes to the next category, in every language.
 * The chip strip is pinned left-to-right for the same reason (see
 * `CategoryTabs`), so the gesture, the chips and the pages agree everywhere
 * without a single branch on the locale.
 */

/** Sideways travel before the pan takes the touch from the list. */
const ACTIVATE_X = 24;
/** Vertical travel that cancels the pan outright — this touch is a scroll. */
const FAIL_Y = 12;
/**
 * How much of the screen must be crossed to commit, as a fraction.
 *
 * A fraction rather than the fixed 1.15 cm the viewer originally asked for:
 * with the next page visibly coming in, the distance is no longer a hidden
 * threshold to be guessed at, it is something being watched. A fifth of the
 * screen is both a deliberate movement and an obvious one.
 */
const COMMIT_FRACTION = 0.2;
/** A flick may stand in for the distance, past this speed and this much travel. */
const COMMIT_VELOCITY = 700;
const FLICK_MIN_DISTANCE = 24;
/** At the first and last category there is nothing to reveal, so the row barely gives. */
const EDGE_RESISTANCE = 3;

/**
 * What the pages settle on.
 *
 * Damped past critical for this stiffness and mass, so a page arrives and
 * stops without overshooting — the calmer settle the viewer asked for after
 * the first spring bounced a little on the way in.
 */
const SETTLE = { damping: 30, stiffness: 220, mass: 0.8 } as const;

/** How far a page off to the side sits back, at a full screen away. */
const PAGE_RECEDE = 0.06;
/** And how far it dims there. Both only ever reached by a page off the edge. */
const PAGE_DIM = 0.3;

/**
 * One page, placed by its distance from the current category.
 *
 * A component of its own because the depth has to be computed per page on the
 * UI thread, and `react-hooks/static-components` forbids declaring a
 * component inside another one.
 */
function Page({
  offset,
  width,
  translateX,
  children,
}: {
  /** −1, 0 or +1: which side of the current category this page is. */
  offset: number;
  width: number;
  translateX: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const x = offset * width + translateX.value;
    const away = Math.min(1, Math.abs(x) / Math.max(1, width));
    return {
      transform: [{ translateX: x }, { scale: 1 - away * PAGE_RECEDE }],
      opacity: 1 - away * PAGE_DIM,
    };
  });

  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

export function CategoryPager({
  ids,
  activeId,
  onSelect,
  renderPage,
  progress,
  enabled = true,
  single = false,
}: {
  /** Every category in strip order, including whatever "All" chip the screen puts first. */
  ids: string[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Builds the list for one category. Called for the current page and the one either side. */
  renderPage: (categoryId: string) => React.ReactNode;
  /**
   * Published to the chip strip so it travels with the finger: 0 at rest,
   * ±1 one page along, positive towards the next category.
   */
  progress?: SharedValue<number>;
  /** False on the television, which has no touchscreen. */
  enabled?: boolean;
  /**
   * Render the current category only, with no gesture and no neighbours.
   *
   * For the television, where the remote steps through the rail and the
   * three-page window would be three focusable grids where there should be
   * one. The screens pass `isTvBuild`, so the television keeps exactly the
   * single list it had before this component existed.
   */
  single?: boolean;
}) {
  const { width } = useWindowDimensions();
  const index = ids.indexOf(activeId);

  const translateX = useSharedValue(0);
  const unwatched = useSharedValue(0);
  const drag = progress ?? unwatched;

  /* The gesture runs on the UI thread and cannot read React state. */
  const indexValue = useSharedValue(index);
  const countValue = useSharedValue(ids.length);
  const widthValue = useSharedValue(width);
  useEffect(() => {
    indexValue.value = index;
    countValue.value = ids.length;
    widthValue.value = width;
  }, [index, ids.length, width, indexValue, countValue, widthValue]);

  /** True between committing a change and the window having re-centred. */
  const awaiting = useRef(false);

  const commit = (direction: 1 | -1) => {
    const next = ids.indexOf(activeId) + direction;
    if (next < 0 || next >= ids.length) {
      translateX.value = withSpring(0, SETTLE);
      drag.value = withSpring(0, SETTLE);
      return;
    }
    awaiting.current = true;
    onSelect(ids[next]);
  };

  const pan = Gesture.Pan()
    .enabled(enabled && ids.length > 1)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onUpdate((event) => {
      "worklet";
      let dx = event.translationX;
      const atStart = indexValue.value <= 0 && dx > 0;
      const atEnd = indexValue.value >= countValue.value - 1 && dx < 0;
      /* Nothing to reveal that way, so the row gives only a third as far. */
      if (atStart || atEnd) dx = dx / EDGE_RESISTANCE;
      translateX.value = dx;
      /* The strip follows the same journey, measured in pages rather than pixels. */
      drag.value = -dx / Math.max(1, widthValue.value);
    })
    /*
      `commit` reads `awaiting`, and handing it to `runOnJS` here looks to
      `react-hooks/refs` like a ref escaping into render. It is not: the only
      caller is the completion callback of the settling spring, well after the
      finger has left the glass, and `commit` never runs while this component
      renders. The flag has to be a ref rather than a shared value because its
      writer and its reader are both on the JavaScript thread.
    */
    // eslint-disable-next-line react-hooks/refs
    .onEnd((event, success) => {
      "worklet";
      const w = Math.max(1, widthValue.value);
      const distance = Math.abs(event.translationX);
      const flicked =
        Math.abs(event.velocityX) > COMMIT_VELOCITY && distance > FLICK_MIN_DISTANCE;
      const forward = event.translationX < 0;
      const target = indexValue.value + (forward ? 1 : -1);
      const blocked = target < 0 || target >= countValue.value;

      if (!success || blocked || (distance < w * COMMIT_FRACTION && !flicked)) {
        translateX.value = withSpring(0, SETTLE);
        drag.value = withSpring(0, SETTLE);
        return;
      }

      drag.value = withSpring(forward ? 1 : -1, SETTLE);
      translateX.value = withSpring(forward ? -w : w, SETTLE, (finished) => {
        "worklet";
        if (!finished) return;
        runOnJS(commit)(forward ? 1 : -1);
      });
    });

  /*
    The window has re-centred, so the row goes back to nought. Nothing moves:
    the page that was one screen along is now the current one and already
    occupies this exact position. See "the handover" above.

    `react-hooks/immutability` sees `drag` as an ordinary local because the
    `??` above erases what `useSharedValue` returned; mutation across renders
    is the whole contract of a shared value, and the identical write inside
    the worklets above is accepted.
  */
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    if (!awaiting.current) return;
    awaiting.current = false;
    translateX.value = 0;
    drag.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /*
    The current category and the one either side. Keyed by category id, so a
    page keeps the same component — and with it its list, its cells and
    wherever the viewer had scrolled it — as the window moves across it.
  */
  const windowIds: string[] = [];
  for (let i = index - 1; i <= index + 1; i++) {
    if (i >= 0 && i < ids.length) windowIds.push(ids[i]);
  }

  if (single) {
    return <View style={styles.fill}>{renderPage(activeId)}</View>;
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>
        {windowIds.map((id) => (
          <Page key={id} offset={ids.indexOf(id) - index} width={width} translateX={translateX}>
            {renderPage(id)}
          </Page>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
});
