import { useEffect, useRef, useState } from "react";
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
 * The category either side of the one you are on is **mounted and on screen**,
 * just off the edge, so a drag reveals it travelling in rather than swapping
 * the content once the finger lifts.
 *
 * ## Why this replaces `CategorySwipe`
 *
 * `CategorySwipe` moved a single list, faded it out, changed the data behind it
 * and faded it back. Its own comment defended that: a real pager "would hold two
 * lists of up to twenty thousand rows alive at once".
 *
 * That was wrong, though not by as much as the first version of this comment
 * then claimed in the other direction. A `FlatList` is virtualized: it mounts
 * the cells in its window and never the twenty thousand rows behind them. Three
 * pages is three windows, not sixty thousand rows — but it is genuinely three,
 * not "about what one page costs", which is what this file used to say. Three
 * pages of a three-column grid is on the order of a hundred and fifty mounted
 * cells against fifty. That is affordable; it is not free, and `active` below
 * exists because of the part that is not.
 *
 * ## Committing, and why it no longer waits
 *
 * The first version committed the category change inside the settling spring's
 * completion callback, so the data change waited out the whole animation — about
 * half a second, which is what the viewer reported as the strip lagging. Worse,
 * a second drag during that window cancelled the spring, the callback never ran,
 * and the page that had already arrived snapped back a full screen.
 *
 * So the commit now happens the instant the finger lifts, and the animation runs
 * **after** it. The effect below does the arithmetic that makes that invisible:
 * at the moment the category changes, every page's offset shifts by one screen
 * width, so adding that same width back to the row leaves every page exactly
 * where it already was. Then the row springs to nought. Nothing waits on
 * anything, and there is no completion callback left to lose.
 *
 * This is also what makes a drag interruptible: `startX` picks up wherever the
 * row happens to be, so a second swipe during the settle continues from there
 * instead of fighting it or being swallowed.
 */

/** Sideways travel before the pan takes the touch from the list. */
const ACTIVATE_X = 24;
/** Vertical travel that cancels the pan outright — this touch is a scroll. */
const FAIL_Y = 12;
/**
 * How much of the screen must be crossed to commit, as a fraction.
 *
 * A fraction rather than a fixed distance: with the next page visibly coming in,
 * the threshold is no longer something to be guessed at, it is something being
 * watched.
 */
const COMMIT_FRACTION = 0.2;
/** A flick may stand in for the distance, past this speed and this much travel. */
const COMMIT_VELOCITY = 700;
const FLICK_MIN_DISTANCE = 24;
/** At the first and last category there is nothing to reveal, so the row barely gives. */
const EDGE_RESISTANCE = 3;

/**
 * What the row settles on.
 *
 * Written in Reanimated 4's duration form on purpose. The first attempt used
 * `damping`/`stiffness`/`mass` with `restDisplacementThreshold` and
 * `restSpeedThreshold` — and those last two are **Reanimated 2 and 3 keys that
 * version 4 does not have**. They were ignored in silence, and TypeScript said
 * nothing because excess-property checking does not reach through an `as const`
 * variable. So the attempt to stop the spring crawling changed nothing, and the
 * spring went on ending only once its energy fell below `energyThreshold`, whose
 * default is 6e-9: a very long tail.
 *
 * `dampingRatio: 1` is critical damping and `overshootClamping` forbids passing
 * the target, which together are the calm settle without the bounce that was
 * asked for — and `duration` bounds it, so it cannot crawl again.
 */
const SETTLE = { duration: 300, dampingRatio: 1, overshootClamping: true } as const;

/** How far a page off to the side sits back, at a full screen away. */
const PAGE_RECEDE = 0.06;
/** And how far it dims there. Both only ever reached by a page off the edge. */
const PAGE_DIM = 0.3;

/**
 * How long the commit is allowed not to arrive before the row is put back.
 *
 * The effect below runs when `activeId` changes. A screen that declines the
 * change — or sets it to the category already showing — would otherwise leave
 * the row displaced with nothing coming to straighten it.
 */
const STRANDED_MS = 400;

/**
 * One page, placed by its distance from the current category.
 *
 * A component of its own because the depth is computed per page on the UI
 * thread, and `react-hooks/static-components` forbids declaring a component
 * inside another one.
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
  /**
   * Builds the list for one category.
   *
   * `artwork` is whether this page may fetch its images. It is false only
   * for the pages either side of a screen that has not been navigated yet:
   * three pages of posters fetching the moment a screen opens is three times
   * the traffic to a provider that answers a burst with empty 404s on every
   * endpoint, and two of those pages are for categories nobody has looked
   * at. After the first category change it is true for every page in the
   * window — see `warm`.
   */
  renderPage: (categoryId: string, artwork: boolean) => React.ReactNode;
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
   * For the television, where the remote steps through the rail and three
   * focusable grids where there should be one would wreck focus.
   */
  single?: boolean;
}) {
  const { width } = useWindowDimensions();

  /*
    **Clamped, and that is not belt and braces.** `activeCategoryId` can name a
    category that is no longer in the strip: the screens restore a remembered
    one without checking it still exists, and the live list drops any category
    that has been hidden or has lost its last channel. `indexOf` then returns
    −1, every page is placed one screen to the right of where it belongs, and
    the content area — which clips — shows nothing at all while the header still
    reports a few hundred channels. Falling back to the first category means the
    worst case is the wrong category rather than a blank screen.
  */
  const found = ids.indexOf(activeId);
  const index = found < 0 ? 0 : found;

  const translateX = useSharedValue(0);
  /** Where the row was when the current gesture began, so a drag can interrupt a settle. */
  const startX = useSharedValue(0);
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

  /**
   * Whether artwork may be fetched for the pages either side as well.
   *
   * False until the first category change, true for ever after. The point
   * of holding artwork back was the burst when a screen first opens: three
   * pages fetching at once, two of them for categories nobody has looked
   * at. Once the viewer is moving between categories that reasoning stops
   * applying — at most one page in the window is new per move, which is
   * exactly the rate the app fetched at before it had pages at all.
   *
   * Gating on "is this page active" instead was wrong, and the viewer
   * caught it: active flips at the moment the category commits, so the
   * page being left lost its posters while it was still sliding across the
   * screen, and every return to a category paid for its images again.
   * Latching removes that without giving up the protection that mattered.
   */
  const [warm, setWarm] = useState(false);

  /** +1 or −1 while a committed change is on its way to React; 0 otherwise. */
  const shift = useRef(0);

  const commit = (direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0 || next >= ids.length) {
      translateX.value = withSpring(0, SETTLE);
      drag.value = withSpring(0, SETTLE);
      return;
    }
    shift.current = direction;
    /* An event, not a render: the first move is what makes the neighbours worth loading. */
    if (!warm) setWarm(true);
    onSelect(ids[next]);
    /*
      If the screen declines the change, nothing will straighten the row. One
      timer per commit is a cheap price for never leaving the grid displaced.
    */
    setTimeout(() => {
      if (!shift.current) return;
      shift.current = 0;
      translateX.value = withSpring(0, SETTLE);
      drag.value = withSpring(0, SETTLE);
    }, STRANDED_MS);
  };

  const pan = Gesture.Pan()
    .enabled(enabled && !single && ids.length > 1)
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onBegin(() => {
      "worklet";
      /* Take over from wherever the row is, mid-settle or at rest. */
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      "worklet";
      const w = Math.max(1, widthValue.value);
      let x = startX.value + event.translationX;
      const atStart = indexValue.value <= 0 && x > 0;
      const atEnd = indexValue.value >= countValue.value - 1 && x < 0;
      /* Nothing to reveal that way, so the row gives only a third as far. */
      if (atStart || atEnd) x = x / EDGE_RESISTANCE;
      translateX.value = x;
      /* The strip follows the same journey, measured in pages rather than pixels. */
      drag.value = -x / w;
    })
    /*
      `commit` reads and writes `shift`, and handing it to `runOnJS` here looks
      to `react-hooks/refs` like a ref escaping into render. It is not: the only
      caller is this gesture's end, and `commit` never runs while this component
      renders.
    */
    // eslint-disable-next-line react-hooks/refs
    .onEnd((event, success) => {
      "worklet";
      const w = Math.max(1, widthValue.value);
      const travelled = Math.abs(startX.value + event.translationX);
      const distance = Math.abs(event.translationX);
      const flicked =
        Math.abs(event.velocityX) > COMMIT_VELOCITY && distance > FLICK_MIN_DISTANCE;

      /*
        A flick takes its direction from the velocity, everything else from how
        far the row has actually moved. Reading direction from displacement
        alone sent a reversing flick — dragged one way, thrown back the other —
        to the category opposite the one it was thrown towards.
      */
      const forward = flicked ? event.velocityX < 0 : startX.value + event.translationX < 0;
      const target = indexValue.value + (forward ? 1 : -1);
      const blocked = target < 0 || target >= countValue.value;

      if (!success || blocked || (travelled < w * COMMIT_FRACTION && !flicked)) {
        translateX.value = withSpring(0, SETTLE);
        drag.value = withSpring(0, SETTLE);
        return;
      }

      /*
        No animation here on purpose: the effect below re-bases the row the
        moment React has the new category, and animating first would be a race
        against it. See "committing, and why it no longer waits".
      */
      runOnJS(commit)(forward ? 1 : -1);
    });

  /*
    The category has changed, so every page's offset has moved by one screen
    width. Adding that width back leaves every page exactly where it already
    was, and the row then springs to nought from there — which is the whole
    transition, happening entirely after the commit rather than before it.

    `react-hooks/immutability` sees `drag` as an ordinary local because the `??`
    above erases what `useSharedValue` returned; mutation across renders is the
    entire contract of a shared value.
  */
  // eslint-disable-next-line react-hooks/immutability
  useEffect(() => {
    const moved = shift.current;
    if (!moved) return;
    shift.current = 0;
    translateX.value = translateX.value + moved * widthValue.value;
    translateX.value = withSpring(0, SETTLE);
    drag.value = drag.value - moved;
    drag.value = withSpring(0, SETTLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /*
    `single` is the television. The empty list is the moment between a
    catalogue arriving and its categories arriving: there is nothing to page
    between yet, and the window loop below would produce no pages at all, so
    the screen would be blank while holding a full catalogue.
  */
  if (single || ids.length === 0) {
    return <View style={styles.fill}>{renderPage(activeId, true)}</View>;
  }

  /*
    The current category and the one either side. Keyed by category id, so a
    page keeps the same component — and with it its list, its cells and
    wherever the viewer had scrolled it — as the window moves across it.
  */
  const windowIds: string[] = [];
  for (let i = index - 1; i <= index + 1; i++) {
    if (i >= 0 && i < ids.length) windowIds.push(ids[i]);
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>
        {windowIds.map((id) => (
          <Page key={id} offset={ids.indexOf(id) - index} width={width} translateX={translateX}>
            {renderPage(id, warm || id === ids[index])}
          </Page>
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
});
