import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { Focusable } from "@/components/Focusable";

import { CachedImage } from "@/components/CachedImage";
import { forgetImageFailures } from "@/core/media/deadImageHosts";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { TV_RAIL_WIDTH } from "@/components/CategorySidebar";
import { CategoryTabs } from "@/components/CategoryTabs";
import { TvBrowseLayout } from "@/components/TvBrowseLayout";
import { ScreenBackground, TV_OVERSCAN_X } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { CategoryPager } from "@/components/CategoryPager";
import { useI18n } from "@/core/i18n/I18nContext";
import { useCategoryDrag } from "@/core/layout/useCategoryDrag";
import { useCategoryPages } from "@/core/layout/useCategoryPages";
import { LIST_WINDOW, QUIET_LIST_WINDOW } from "@/core/layout/listWindow";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { getHiddenCategoryIds } from "@/db/repositories/categoryVisibilityRepository";
import type { SeriesSummary } from "@/domain/series/types";
import { useGridColumns } from "@/core/layout/useGridColumns";
import { getActiveSession } from "@/state/activeSessionStore";
import { loadSeriesCategories } from "@/state/categoryQueries";
import { getSeriesList, loadSeriesList } from "@/state/seriesStore";

const ALL_CATEGORY_ID = "all";

/** One empty array for every category with nothing in it, so the list is never handed a new one. */
const NOTHING: never[] = [];
const SEARCH_DEBOUNCE_MS = 200;
/** Portrait density; landscape is decided by `useGridColumns`. */
const PORTRAIT_COLUMNS = 3;

/*
 * Cell geometry, kept beside the styles that implement it so the two
 * cannot drift apart — `getItemLayout` is only sound while they agree.
 */
const GRID_PADDING = Spacing.md;
const COLUMN_GAP = Spacing.sm;
const CELL_PADDING = Spacing.xs;
const POSTER_RATIO = 3 / 2;
const TITLE_GAP = Spacing.xs;
const TITLE_BOX_HEIGHT = 32;
/**
 * The year line under the title. It has to be part of the geometry, not an
 * afterthought: it used to render below the fixed title box without being
 * counted here, so every declared row was ~16px shorter than the real one.
 * With `getItemLayout` supplied the list never measures a cell, so that
 * error compounded row after row until, a few hundred series down, the
 * cells under the finger fell outside the render window and went blank.
 */
const YEAR_BOX_HEIGHT = 16;
const ROW_GAP = Spacing.md;

/**
 * The exact height of one grid row, so the list can place every row
 * without measuring it.
 *
 * Measuring was the other half of the stutter: rows are laid out as they
 * come into view, and because titles could be one line or two the rows had
 * different heights, so the list kept correcting its own content size and
 * scroll offset underneath the finger — which reads as the screen
 * shivering. Uniform rows plus this function remove both the measuring and
 * the corrections.
 */
function rowHeight(listWidth: number, columns: number): number {
  const available = listWidth - GRID_PADDING * 2 - COLUMN_GAP * (columns - 1);
  const posterWidth = available / columns - CELL_PADDING * 2;
  return posterWidth * POSTER_RATIO + TITLE_GAP + TITLE_BOX_HEIGHT + YEAR_BOX_HEIGHT + ROW_GAP;
}

interface CategoryTab {
  id: string;
  name: string;
}

/**
 * Lands directly on the poster grid — categories are a horizontally
 * scrolling tab row filtering the same grid in place, not a separate screen
 * you have to drill through first. Matches how real IPTV players browse;
 * see the identical reasoning in live-categories.tsx.
 */
export default function SeriesCategoriesScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const session = getActiveSession();
  const columns = useGridColumns(PORTRAIT_COLUMNS);
  /*
     * The list's own width, not the window's. The grid sits inside a
     * `SafeAreaView` with every edge enabled, and SDK 57 draws edge to edge,
     * so in landscape a navigation bar or a display cutout makes the list
     * narrower than the screen — and `getItemLayout` would then promise
     * taller rows than are actually drawn.
     */
    const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /*
   * The rail is subtracted on TV: the grid is not the window, and
   * `getItemLayout` below promises a row height derived from this number.
   * See TV_RAIL_WIDTH for what a wrong promise does to a scrolling list.
   *
   * Subtracted unconditionally on the TV build, including the rare case of
   * a provider with one category where no rail renders. Erring this way
   * under-states the row height, which costs a little extra rendering;
   * erring the other way puts holes in the list.
   */
  /*
    `TV_OVERSCAN_X` is part of this sum because `ScreenBackground` pads the
    whole screen on the television and neither `useWindowDimensions` nor
    `useSafeAreaInsets` reports that padding. Leaving it out overstated the
    row height by the width of two 96dp margins spread across the columns.
  */
  const gridWidth =
    windowWidth - insets.left - insets.right - TV_OVERSCAN_X - (isTvBuild ? TV_RAIL_WIDTH : 0);
  const gridRowHeight = rowHeight(gridWidth, columns);

  const [series, setSeries] = useState<SeriesSummary[] | null>(() => getSeriesList());
  const [categories, setCategories] = useState<CategoryTab[] | null>(null);
  const [chosenCategoryId, setActiveCategoryId] = useState<string>(ALL_CATEGORY_ID);
  /**
   * The category actually being shown, which is not always the one chosen.
   *
   * A chosen id can stop existing: it is dropped when the viewer hides that
   * category, when the provider stops listing it, or when its last channel
   * goes — and on Live TV it is remembered across launches, so it can
   * arrive already stale. Nothing used to reconcile the two, and the three
   * things that read it then disagreed: the header counted nought, the
   * grid fell back to "All" through the pager's own clamp, and the strip
   * filled in no chip at all, because none of them matched. The viewer saw
   * "0 channels" written over a full lineup with nothing highlighted, and
   * only tapping a chip got out of it.
   *
   * Derived rather than corrected in an effect: an effect that calls
   * `setState` on a render is a cascade this project's lint rules reject,
   * and there is nothing to correct anyway — what is shown *is* a function
   * of the chosen id and the list that exists.
   */
  const activeCategoryId = useMemo(() => {
    const strip = categories ?? [];
    if (strip.length === 0) return chosenCategoryId;
    return strip.some((c) => c.id === chosenCategoryId) ? chosenCategoryId : strip[0].id;
  }, [categories, chosenCategoryId]);
  /*
    Where the viewer was in each category, and the order a sideways drag
    steps through. Both read the same list the chip strip is built from,
    so the gesture and the strip can never disagree about what comes next.
  */
  const categoryIds = useMemo(() => (categories ?? []).map((c) => c.id), [categories]);
  /* Handed to both the strip and the drag surface, so the chips travel with the finger. */
  const categoryDrag = useCategoryDrag();
  /** Only the first load picks a default; a refresh must not yank the user back. */
  const categoryAppliedRef = useRef(false);
  /**
   * Latched once the grid has taken focus, so `hasTVPreferredFocus` is a
   * one-shot request rather than something that re-fires and steals focus
   * back from the tabs or the search field. See the note in this file's
   * grid cell.
   */
  const tvFocusClaimedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  /*
    Where the viewer was in each category — declared here, below the
    search term, because the term is part of its key. A pixel offset
    belongs to the shape that produced it: the column count, which
    changes when the phone is turned, and the search, which changes what
    is in the list at all. Give it a different shape and it reports no
    remembered position rather than a wrong one, and the list opens at
    the top.
  */
  /*
    One position per category, kept for the screen rather than for a list:
    three lists are mounted at once now, and a page keeps its place even
    after the window has moved past it and unmounted it.
  */
  const pages = useCategoryPages<SeriesSummary>(`${columns}|${search}`);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDataRef = useRef(false);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!session) return;
      try {
        const cached = getSeriesList();
        const list = cached && !forceRefresh ? cached : await loadSeriesList(session.config, { forceRefresh });
        setSeries(list);

        const [raw, hidden] = await Promise.all([
          loadSeriesCategories(session.provider.id, session.config),
          getHiddenCategoryIds("series"),
        ]);
        const presentIds = new Set(list.map((s) => s.categoryId));
        const nonEmpty = raw.filter((c) => presentIds.has(c.id) && !hidden.has(c.id));
        const tabs = [{ id: ALL_CATEGORY_ID, name: t("liveCategories", "allCategory") }, ...nonEmpty];
        setCategories(tabs);
        /*
         * Open on the first real category, not "All" — the same default
         * Live TV uses. "All" here means the provider's entire catalogue
         * in one list, which is not a view anyone browses on purpose; it
         * is a filter you reach for, so it stays available as the first
         * tab rather than being where the screen starts.
         */
        if (!categoryAppliedRef.current && tabs.length > 1) {
          categoryAppliedRef.current = true;
          setActiveCategoryId(tabs[1].id);
        }
        setErrorMessage(null);
        hasDataRef.current = true;
      } catch (error) {
        if (!hasDataRef.current) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
      }
    },
    [session, t]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  async function handleRefresh() {
    /*
      A pull is the viewer saying "try again", and artwork is the part of the
      screen they can see has failed. Without this the only cure for a tile
      that went blank on a bad connection was killing the app.
    */
    forgetImageFailures();
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  /**
   * The titles of one category, for any category — not only the current one.
   *
   * `CategoryPager` keeps the page either side of this one mounted, so the
   * filtering can no longer be a value derived from `activeCategoryId`: it
   * has to answer for whichever three categories are on screen at once.
   */
  /*
    **Every category grouped once, rather than filtered three times.**

    Three pages ask for their items on every render, and the obvious shape
    — a function that filters on demand — is three scans of the whole
    catalogue each time, with a `toLowerCase` allocation per item. One
    pass that buckets everything costs the same as a single one of those
    scans and answers every category, including the ones the pager has not
    reached yet.

    A cache behind a closure was the first attempt and is not allowed here:
    `react-hooks/immutability` forbids mutating a local after render, and
    the mutation in that shape happens when a page calls the closure. This
    builds its map during the render that creates it, which is exactly what
    the rule is asking for, and is the better algorithm anyway.
  */
  const byCategory = useMemo(() => {
    const grouped = new Map<string, SeriesSummary[]>();
    if (!series) return grouped;
    const pool = search
      ? series.filter((s) => s.name.toLowerCase().includes(search))
      : series;
    grouped.set(ALL_CATEGORY_ID, pool);
    for (const item of pool) {
      /* The provider leaves this null on some rows; those live in "All" only. */
      const key = item.categoryId;
      if (key === null) continue;
      const bucket = grouped.get(key);
      if (bucket) bucket.push(item);
      else grouped.set(key, [item]);
    }
    return grouped;
  }, [series, search]);

  const itemsFor = useCallback(
    (categoryId: string) => byCategory.get(categoryId) ?? NOTHING,
    [byCategory]
  );

  /** Only for the count in the header, which is about the category being looked at. */
  const filteredSeries = useMemo(() => itemsFor(activeCategoryId), [itemsFor, activeCategoryId]);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  /*
    Stable, and the memo on the cell is worthless without it. Measured on the
    owner's device: memoising the movie cell and stabilising its callbacks
    took a hard fling from 21.99% janky frames to 0.70%, p50 17ms to 8ms,
    with this screen left unmemoised as the control at 19.51%.

    Above the early return, because a hook after one is a hook that is not
    always called.
  */
  const openSeries = useCallback((item: SeriesSummary) => {
    router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: item.providerItemId } });
  }, []);

  const claimTvFocus = useCallback(() => {
    tvFocusClaimedRef.current = true;
  }, []);

  if (!session) {
    return null;
  }

  return (
    <ScreenBackground>
      {/* No bottom edge: the tab bar below already clears the gesture area,
          and asking for it here too leaves a second empty strip. */}
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={t("seriesCategories", "title")}
        subtitle={`${filteredSeries.length.toLocaleString()} ${t("seriesGrid", "seriesCountSuffix")}`}
        /*
          The television's only way to reload the catalogue. Every other
          refresh path in the app is a pull gesture, which a remote cannot
          perform — so a provider adding titles was invisible until the
          provider was removed and re-added. `isTvBuild`-gated, so the
          phone header is unchanged and keeps the pull.
        */
        right={
          isTvBuild ? (
            <Focusable
              onPress={handleRefresh}
              disabled={refreshing}
              style={styles.tvHeaderButton}
              round
              hitSlop={10}
            >
              <Text style={styles.tvHeaderGlyph}>{refreshing ? "⋯" : "⟳"}</Text>
            </Focusable>
          ) : undefined
        }
      />

      {/*
        Phone only. On a television these two are replaced by the
        category rail below: a horizontal strip costs one press per
        category and fights the grid for Up and Down, and a `TextInput`
        on the main vertical path opens the on-screen keyboard the
        moment the D-pad passes through it and swallows every key until
        Back. Same arrangement as Live TV — see TvBrowseLayout.
      */}
      {isTvBuild ? null : (
        <>
          {/*
            The same strip Live TV uses, not a second copy of it.

            This screen carried its own inline `FlatList` with its own pill
            styles, and the two had drifted: 44pt tall chips at 13pt text
            here against 30pt at 12pt there, so Movies and Series read as a
            heavier interface than Channels for no reason
            (reported 2026-09-16). The shared component already carries
            every fix this one did — `minHeight` rather than a fixed
            height, an explicit `lineHeight`, `AndroidTextFix` and a
            `maxWidth` — which is what a mixed Arabic/Latin category name
            needs in order not to be clipped.
          */}
          {categories && categories.length > 1 && (
            <CategoryTabs
              categories={categories}
              activeId={activeCategoryId}
              onSelect={setActiveCategoryId}
              progress={categoryDrag}
            />
          )}

          <TextInput
            style={styles.search}
            placeholder={t("seriesGrid", "searchPlaceholder")}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={searchInput}
            onChangeText={setSearchInput}
          />
        </>
      )}

      <TvBrowseLayout categories={categories} activeId={activeCategoryId} onSelect={setActiveCategoryId}>
    {errorMessage && (
      <View style={styles.errorBlock}>
        <Text style={styles.error}>{errorMessage}</Text>
        {/*
          A first load that fails used to leave the spinner turning under
          this line for ever: the list state stayed null, so the FlatList —
          and with it pull-to-refresh — never rendered, and the only way
          out was to leave the screen and come back.
        */}
        <BouncePressable style={styles.retryButton} onPress={() => load()}>
          <Text style={styles.retryButtonText}>{t("common", "retry")}</Text>
        </BouncePressable>
      </View>
    )}

    {series === null ? (
      <View style={styles.centered}>
        {/* No spinner once a load has already failed — the retry button above is the way forward. */}
        {!errorMessage && <ActivityIndicator color={Brand.primary} />}
      </View>
    ) : (
      /*
        The category either side of this one is mounted and just off the
        edge, so a sideways drag reveals it coming in rather than swapping
        the content once the finger lifts. On the television it collapses
        to the single list it has always been — see `single`.
      */
      <CategoryPager
        ids={categoryIds}
        activeId={activeCategoryId}
        onSelect={setActiveCategoryId}
        enabled={!isTvBuild}
        single={isTvBuild}
        progress={categoryDrag}
        renderPage={(pageCategoryId, pageActive) => (
      <FlatList
        ref={pages(pageCategoryId).listRef}
        {...pages(pageCategoryId).scroll}
        data={itemsFor(pageCategoryId)}
        keyExtractor={(item) => item.providerItemId}
        key={columns}
        numColumns={columns}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        refreshControl={
          /* See the header button — a pull cannot happen on a television. */
          isTvBuild ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Brand.primary} />
          )
        }
        renderItem={({ item, index }) => (
          <SeriesPoster
            series={item}
            columns={columns}
            artwork={pageActive}
            tvFocusFirst={index === 0 && !tvFocusClaimedRef.current}
            onTvFocus={claimTvFocus}
            onPress={openSeries}
          />
        )}
        getItemLayout={(_, index) => ({
          length: gridRowHeight,
          offset: gridRowHeight * index,
          index,
        })}
        {...(pageActive ? LIST_WINDOW : QUIET_LIST_WINDOW)}
      />
        )}
      />
    )}
      </TvBrowseLayout>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * Plain `Pressable`, no `entering` animation — see the note on
 * `ChannelRow` in live-categories.tsx. Per-cell entrance animations and
 * per-cell Reanimated values re-fire on every recycle while scrolling a
 * full catalogue, which is what made scrolling stutter.
 */
/* Memoised — see `openSeries`. `memo(function …)` because `react/display-name` wants a name. */
const SeriesPoster = memo(function SeriesPoster({
  series,
  columns,
  artwork,
  tvFocusFirst,
  onTvFocus,
  onPress,
}: {
  series: SeriesSummary;
  columns: number;
  /**
   * Whether this page may fetch its poster.
   *
   * False for the two pages either side of the one being looked at. They are
   * mounted so a drag can reveal them, which means they would otherwise all
   * fetch at once — three screens of artwork for a provider that answers a
   * burst with empty 404s on every endpoint, two of those screens for nobody.
   * The skeleton underneath already carries the name, so holding the image
   * back reads as a card that has not loaded yet rather than as a hole.
   */
  artwork: boolean;
  /** Exactly one cell per screen sets this — where a TV remote starts. */
  tvFocusFirst: boolean;
  /** Latches the screen's one-shot focus request — see `tvFocusClaimedRef`. */
  onTvFocus: () => void;
  onPress: (item: SeriesSummary) => void;
}) {
  /* One closure for the life of the cell, so the memo can bail. */
  const press = useCallback(() => onPress(series), [onPress, series]);
  return (
    <View style={[styles.posterCell, { flex: 1 / columns, maxWidth: `${100 / columns}%` }]}>
    <Focusable onPress={press} style={styles.posterWrap} hasTVPreferredFocus={tvFocusFirst} onFocus={onTvFocus}>
      <View style={styles.posterImageWrap}>
        {/*
          The title sits *behind* the poster rather than being switched in
          and out by a `loaded` flag. The poster paints over it once it
          decodes, and stays uncovered if the image is missing or fails —
          the same result, without a state update and a re-render per cell
          arriving in the middle of a scroll.
        */}
        <View style={styles.posterSkeleton}>
          <Text style={styles.posterFallbackText} numberOfLines={4}>
            {series.name}
          </Text>
        </View>
        {series.posterUrl && artwork && (
          <CachedImage uri={series.posterUrl} style={styles.posterImage} resizeMode="cover" />
        )}
        {series.rating !== null && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingBadgeText}>★ {series.rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
      <View style={styles.posterTitleBox}>
        <Text style={styles.posterTitle} numberOfLines={2}>
          {series.name}
        </Text>
      </View>
      {/*
        Always rendered, even with no year: an element that appears on some
        cards and not others makes rows different heights, and `getItemLayout`
        below promises the list they are all identical.
      */}
      <View style={styles.posterYearBox}>
        <Text style={styles.posterYear} numberOfLines={1}>
          {series.year ?? ""}
        </Text>
      </View>
    </Focusable>
    </View>
  );
});

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  /* Television only — see the header's `right` slot. */
  tvHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tvHeaderGlyph: { color: C.text, fontSize: 20, fontFamily: FontFamily.bold },

  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  /**
   * Fixed height with vertically centred content, and an explicit
   * lineHeight on the label. Noto Kufi Arabic (this app's only font) has
   * much taller ascender/descender metrics than a Latin face at the same
   * `fontSize`, and Android was clipping the top and bottom of Arabic
   * category names inside a padding-only chip. Sizing the chip and the
   * line box explicitly — rather than letting them fall out of the font
   * metrics — makes the strip render identically for Arabic and Latin
   * names. `maxWidth` keeps a very long category name from taking the
   * whole strip.
   */
  /**
   * `minHeight` + `paddingVertical`, not a fixed `height`: a mixed
   * Arabic/Latin category name (e.g. "NETFLIX VOD - نتفلكس") was still
   * getting visually cut at the top of the pill even after the
   * `includeFontPadding`/`lineHeight` fixes above — its line box measures
   * taller than the plain-Arabic tabs next to it, mixing two scripts'
   * font metrics on one line. A fixed height can only ever clip that
   * overflow; `minHeight` lets the pill grow to whatever the content
   * actually needs instead, which makes this a structural fix rather than
   * another guessed number.
   */
  /**
   * A solid fill, not a tinted background + border. The active tab used to
   * be `primaryMuted` (a near-invisible 15%-opacity red) plus a 1px red
   * outline carrying the entire "this is selected" signal on its own — and
   * a hairline stroke on a fully-rounded pill is exactly the shape Android
   * anti-aliases inconsistently at the curve's tightest points, which
   * looked like a broken/incomplete ring around "All" (reported
   * 2026-09-03). A solid fill can't show that kind of gap: there's no
   * stroke to break, the whole shape is one filled region.
   */

  search: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    color: C.text,
    fontSize: 14,
    fontFamily: FontFamily.regular,
  },

  errorBlock: { alignItems: "center", gap: Spacing.sm, marginTop: Spacing.md },
  retryButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    borderRadius: Radii.md,
    backgroundColor: Brand.primary,
  },
  retryButtonText: {
    color: C.onAccent,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  error: {
    color: C.error,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  grid: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  gridRow: { gap: Spacing.sm, marginBottom: Spacing.md },

  posterCell: { paddingHorizontal: Spacing.xs },
  posterWrap: { flex: 1 },
  posterImageWrap: {
    aspectRatio: 2 / 3,
    borderRadius: Radii.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    position: "relative",
  },
  posterImage: { width: "100%", height: "100%" },
  posterSkeleton: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
  },
  posterFallbackText: {
    color: C.textSecondary,
    fontSize: 11,
    fontFamily: FontFamily.medium,
    textAlign: "center",
  },
  ratingBadge: {
    position: "absolute",
    top: Spacing.xs,
    end: Spacing.xs,
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  ratingBadgeText: { color: "#FFD700", fontSize: 10, fontFamily: FontFamily.bold },
  /**
   * A fixed box for the title, which is what makes every row exactly
   * `rowHeight()` tall and `getItemLayout` correct.
   *
   * It is sized off an explicit `lineHeight` with room to spare — two
   * lines of 15 in a box of 32 — rather than tight to the text. Noto Kufi
   * measures a taller line box for a mixed Arabic/Latin title than for a
   * plain-Arabic one, and a box sized exactly to the nominal height clips
   * the taller case; that has bitten this project three separate times.
   */
  posterTitleBox: { height: TITLE_BOX_HEIGHT, marginTop: TITLE_GAP, overflow: "hidden" },
  posterTitle: {
    color: C.text,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: FontFamily.medium,
    ...AndroidTextFix,
  },
  posterYearBox: { height: YEAR_BOX_HEIGHT, justifyContent: "center", overflow: "hidden" },
  posterYear: {
    color: C.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FontFamily.regular,
    ...AndroidTextFix,
  },
  })
);
