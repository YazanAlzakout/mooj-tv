import { createContext, useContext, useEffect, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type CellRendererProps,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { NO_CLIP } from "@/core/layout/listWindow";

import { BouncePressable } from "@/components/BouncePressable";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

export interface CategoryTabItem {
  id: string;
  name: string;
}

/**
 * The horizontal category strip shared by every browsing surface.
 *
 * Two details here are load-bearing and were each found the hard way:
 * `minHeight` rather than a fixed height, because a mixed Arabic/Latin
 * category name measures a taller line box than a plain-Arabic one and a
 * fixed height can only clip that; and a solid fill for the active tab
 * rather than a tinted background plus a hairline border, because Android
 * anti-aliases a thin stroke on a fully rounded pill inconsistently and it
 * rendered as a visibly broken ring.
 *
 * ## Following the finger (2026-10-07)
 *
 * The strip takes an optional `progress` from `CategorySwipe`: a number
 * running from 0 to ±1 as a sideways drag crosses the distance that commits
 * a category change. While it is non-zero the strip scrolls to match, so the
 * chips travel under the finger at the same rate as the content and the two
 * read as one object rather than a list with a menu bolted above it.
 *
 * **The scroll target is absolute, never a delta, and that is what makes the
 * handover invisible.** At the end of a committed drag the strip sits at
 * `centre(i) + 1 × (centre(i+1) − centre(i))`, which is exactly `centre(i+1)`.
 * The category then changes, `progress` returns to 0, and the new resting
 * target is `centre(i+1)` — the same pixel. So it does not matter whether
 * React commits the new category before or after the animation reaches the
 * end, and no ordering between the two has to be arranged or defended.
 *
 * It runs entirely on the UI thread: `useAnimatedReaction` reads the shared
 * value and `scrollTo` moves the list, so a drag costs no JavaScript at all.
 *
 * ## Why the positions are measured rather than calculated
 *
 * The chips are content-width — a category name sets its own pill — so the
 * only way to know where one sits is to measure it. The measurement is taken
 * on the list's *cell*, not on the chip inside it: a `FlatList` wraps every
 * item, so a chip's own `onLayout` reports an x relative to that wrapper,
 * which is always nought and tells us nothing. The cell is a direct child of
 * the content container, so its x is the one we want.
 *
 * Measuring also sidesteps the direction question. Arabic forces a
 * right-to-left layout, where the first chip is the rightmost and x counts
 * down rather than up; measured positions and `scrollTo` are both physical,
 * so the same arithmetic holds in both languages without a special case —
 * the same reasoning as the television build's own chip strip.
 *
 * A chip too far away to be mounted has no measurement, and the strip then
 * falls back to `scrollToIndex`, which is also the path a tap takes.
 */

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<CategoryTabItem>);

/**
 * How many times a refused scroll is retried, and how long apart.
 *
 * A `FlatList` renders in batches, so a chip far along the strip becomes
 * measurable a few batches after the screen appears rather than at once.
 * Six attempts a fifth of a second apart give it a little over a second,
 * which covers a strip of any length the provider offers — and they stop,
 * so a chip that never measures cannot retry for ever.
 */
const MAX_SCROLL_ATTEMPTS = 6;
const SCROLL_RETRY_MS = 200;

/** Reports a cell's measured box. Null on the television, where nothing drags. */
const CellMeasure = createContext<((index: number, x: number, width: number) => void) | null>(null);

/**
 * The list's cell wrapper, so the measurement is taken where the geometry is.
 *
 * Declared at module scope because `react-hooks/static-components` forbids
 * creating a component type during a render, and reached through a context
 * rather than a prop because `CellRendererComponent` is given as a type, not
 * as an element — there is nowhere to pass it anything.
 */
function MeasuredCell({
  index,
  style,
  children,
  onLayout,
}: CellRendererProps<CategoryTabItem>) {
  const report = useContext(CellMeasure);
  /*
    `onFocusCapture` is the one cell prop not forwarded. It exists for
    television focus management, its React Native type does not agree with
    the one `View` accepts, and this strip is never rendered on the
    television — the grids put it behind `isTvBuild` and the split player is
    a phone layout. Forwarding it would mean a cast for something that cannot
    be reached.
  */
  return (
    <View
      style={style}
      onLayout={(event: LayoutChangeEvent) => {
        /* The list's own handler first — it is how a cell gets measured at all. */
        onLayout?.(event);
        report?.(index, event.nativeEvent.layout.x, event.nativeEvent.layout.width);
      }}
    >
      {children}
    </View>
  );
}

export function CategoryTabs({
  categories,
  activeId,
  alwaysDark = false,
  onSelect,
  progress,
}: {
  categories: CategoryTabItem[];
  activeId: string;
  /**
   * Forces the dark palette regardless of the theme.
   *
   * Set by the split live layout, whose surroundings are pinned dark like
   * every other player surface. Themed, this strip turned into
   * `rgba(0,0,0,0.05)` pills with grey labels on a near-black page in light
   * mode — invisible. It is also the one themed component rendered inside a
   * screen that does not subscribe to theme changes.
   */
  alwaysDark?: boolean;
  onSelect: (id: string) => void;
  /**
   * How far a sideways drag has travelled, from `CategorySwipe`: 0 at rest,
   * ±1 at the point a category change commits, positive towards the next
   * category in strip order. Omitted on the television, where there is no
   * touchscreen and the strip is stepped with a remote.
   */
  progress?: SharedValue<number>;
}) {
  const listRef = useAnimatedRef<FlatList<CategoryTabItem>>();
  /** Which chip the list has refused to scroll to, and how often. See the handler. */
  const retried = useRef({ index: -1, count: 0 });
  const activeIndex = categories.findIndex((category) => category.id === activeId);

  /*
    Stands in when no drag is wired up, so the reaction below is always
    installed with a real shared value and the hook order never varies.
    Nothing writes it, so the reaction simply never acts.
  */
  const atRest = useSharedValue(0);
  const drag = progress ?? atRest;

  /** Measured cell boxes by index, and the viewport they are scrolled inside. */
  const boxes = useSharedValue<Record<number, { x: number; width: number }>>({});
  const stripWidth = useSharedValue(0);
  const contentWidth = useSharedValue(0);
  const activeIndexValue = useSharedValue(activeIndex);

  const report = (index: number, x: number, width: number) => {
    const known = boxes.value[index];
    if (known && known.x === x && known.width === width) return;
    boxes.value = { ...boxes.value, [index]: { x, width } };
  };

  const onStripLayout = (event: LayoutChangeEvent) => {
    stripWidth.value = event.nativeEvent.layout.width;
  };

  const onContentSizeChange = (width: number) => {
    contentWidth.value = width;
  };

  const bring = (index: number) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  };

  useEffect(() => {
    activeIndexValue.value = activeIndex;
  }, [activeIndex, activeIndexValue]);

  /*
    **The chosen chip is always in view.**

    Until the sideways drag existed, the only way to change category was to
    tap a chip — necessarily one already on screen — so the strip never had
    to move and nothing here scrolled it. A drag can choose a chip that is
    off the end, and then the only sign anything had happened was the
    content changing under the finger, with the strip above still showing
    the old category filled in.

    This is the settling path, for a tap and for any category chosen from
    elsewhere. A drag is handled by the reaction below, which is already
    holding the strip at the right place by the time this runs — so it steps
    aside rather than start a second, competing scroll.
  */
  useEffect(() => {
    if (activeIndex < 0) return;
    if (drag.value !== 0) return;
    retried.current = { index: -1, count: 0 };
    bring(activeIndex);
    /*
      `bring` and the shared values are stable for the life of the component,
      and `react-hooks/immutability` forbids writing to anything a dependency
      array names — which the measurement callbacks must do.
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  /*
    The strip under the finger. See "Following the finger" above for why the
    target is absolute. `centre` returns null for a chip that has never been
    mounted and so never measured, and the reaction then stands down and
    leaves the settling effect to do the work.
  */
  useAnimatedReaction(
    () => drag.value,
    (p, previous) => {
      "worklet";
      /*
        Nought and not coming from a drag: the strip is at rest and this is a
        tap or a category chosen elsewhere, which the settling effect
        animates. Nought *after* a drag is the end of one, and is handled —
        it is what puts the strip exactly on the chip when the neighbour was
        never measured and the interpolation above could not reach it.
      */
      if (p === 0 && !previous) return;
      const index = activeIndexValue.value;
      const viewport = stripWidth.value;
      if (viewport <= 0) return;

      const limit = Math.max(0, contentWidth.value - viewport);
      const centre = (i: number) => {
        "worklet";
        const box = boxes.value[i];
        if (!box) return null;
        return Math.max(0, Math.min(limit, box.x + box.width / 2 - viewport / 2));
      };

      const from = centre(index);
      if (from === null) return;
      if (p === 0) {
        scrollTo(listRef, from, 0, false);
        return;
      }
      const to = centre(index + (p > 0 ? 1 : -1));
      const target = to === null ? from : from + Math.abs(p) * (to - from);
      scrollTo(listRef, target, 0, false);
    }
  );

  return (
    <CellMeasure.Provider value={report}>
      <AnimatedFlatList
        {...NO_CLIP}
        ref={listRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={onStripLayout}
        onContentSizeChange={onContentSizeChange}
        CellRendererComponent={MeasuredCell}
        onScrollToIndexFailed={(info) => {
          /*
            A chip too far along to have been mounted has no measured frame,
            so the list refuses rather than guess.

            The first refusal of a screen is special and the first version of
            this got it wrong (review, 2026-10-07). It arrives before any cell
            has reported its layout, so `averageItemLength` is nought, the
            estimate below is nought times the index — that is, the start of
            the strip — and nothing new is mounted by going there. Spending
            the one retry on that attempt meant a chip past about the tenth
            was never centred at all: the retry fired while only the first
            batch had been measured, failed in turn, and the guard then
            silenced every refusal after it. Opening Live TV on a remembered
            category half way along the strip did exactly that.

            So: ignore an estimate of nought, and allow a handful of attempts
            rather than one. Measurement arrives in batches, and a few
            unhurried tries cover a strip of any length — while still ending,
            which is what the counter is for.
          */
          const attempt = retried.current;
          if (attempt.index !== info.index) {
            attempt.index = info.index;
            attempt.count = 0;
          }
          if (attempt.count >= MAX_SCROLL_ATTEMPTS) return;
          attempt.count += 1;
          if (info.averageItemLength > 0) {
            listRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }
          setTimeout(() => bring(info.index), SCROLL_RETRY_MS);
        }}
        data={categories}
        keyExtractor={(item) => item.id}
        style={styles.strip}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <BouncePressable
            style={[styles.tab, alwaysDark && styles.tabDark, activeId === item.id && styles.tabActive]}
            onPress={() => onSelect(item.id)}
          >
            <Text
              style={[
                styles.tabText,
                alwaysDark && styles.tabTextDark,
                activeId === item.id && styles.tabTextActive,
              ]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </BouncePressable>
        )}
      />
    </CellMeasure.Provider>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  /**
   * `flexGrow: 0` is load-bearing. A horizontal FlatList is still a
   * ScrollView, and inside a flex column it will happily expand past its
   * content — with the pills centred inside, that showed up as a large
   * empty band above and below the strip rather than as a scroll area.
   * The height stays content-driven, so a taller label still fits.
   */
  strip: { flexGrow: 0 },
  list: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    alignItems: "center",
  },
  /**
   * Half the height it started at, and without the hairline border: the
   * strip is a filter, not a row of buttons competing with the content
   * under it. `minHeight` still, never a fixed height — a mixed
   * Arabic/Latin name measures a taller line box than a plain-Arabic one.
   */
  tab: {
    minHeight: 30,
    justifyContent: "center",
    maxWidth: 200,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
  },
  tabDark: { backgroundColor: "rgba(255,255,255,0.06)" },
  tabActive: { backgroundColor: Brand.primary },
  tabText: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  tabTextDark: { color: "#9CA3AF" },
  tabTextActive: { color: "#fff" },
  })
);
