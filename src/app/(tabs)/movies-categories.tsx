import { router, useFocusEffect } from "expo-router";
import { ArtScrim } from "@/components/ArtScrim";
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
import { BrowseLayout } from "@/components/TvBrowseLayout";
import { PHONE_RAIL_WIDTH } from "@/components/CategoryRail";
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
import type { MovieSummary } from "@/domain/vod/types";
import { useGridColumns } from "@/core/layout/useGridColumns";
import { getActiveSession } from "@/state/activeSessionStore";
import { loadMovieCategories } from "@/state/categoryQueries";
import { getVodMovies, loadVodMovies } from "@/state/vodStore";

const ALL_CATEGORY_ID = "all";

/** One empty array for every category with nothing in it, so the list is never handed a new one. */
const NOTHING: never[] = [];
const SEARCH_DEBOUNCE_MS = 200;
/** Portrait density; landscape is decided by `useGridColumns`. */
/*
 * Two, not the three this started with.
 *
 * Three portrait posters across a phone, with the title underneath, is the
 * shape the app this was cloned from uses — and at that size a poster is a
 * thumbnail: you read the title, not the artwork. The rail down the side
 * takes 84dp anyway, so the honest choice was two larger posters with the
 * name written over them. The artwork becomes the thing you browse by,
 * which is the whole point of having it.
 */
const PORTRAIT_COLUMNS = 2;

/*
 * Cell geometry, kept beside the styles that implement it so the two
 * cannot drift apart — `getItemLayout` is only sound while they agree.
 */
const GRID_PADDING = Spacing.md;
const COLUMN_GAP = Spacing.sm;
const CELL_PADDING = Spacing.xs;
const POSTER_RATIO = 3 / 2;
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
  /*
   * No title box in this sum any more. The name is drawn over the bottom
   * of the poster rather than under it, so a row is exactly a poster plus
   * the gap below it — which also means a two-line title and a one-line
   * title produce identical rows, and the list never has to correct its
   * own content size mid-scroll.
   */
  return posterWidth * POSTER_RATIO + ROW_GAP;
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
export default function MoviesCategoriesScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const session = getActiveSession();
  /*
     * The list's own width, not the window's. The grid sits inside a
     * `SafeAreaView` with every edge enabled, and SDK 57 draws edge to edge,
     * so in landscape a navigation bar or a display cutout makes the list
     * narrower than the screen — and `getItemLayout` would then promise
     * taller rows than are actually drawn.
     */
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /*
   * Turned sideways the categories move to a strip on top, so nothing
   * takes width off the grid — and `getItemLayout` has to be told, or
   * it promises rows sized for a narrower list than the one drawn.
   */
  const phoneRail = windowWidth > windowHeight ? 0 : PHONE_RAIL_WIDTH;
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
    windowWidth - insets.left - insets.right - TV_OVERSCAN_X - (isTvBuild ? TV_RAIL_WIDTH : phoneRail);
  /*
   * Width first, then the column count, then the row height — in that
   * order and not the other way round. The count is now worked out FROM
   * the row height a given count would produce (see useGridColumns), and
   * the row height needs the grid's width, which does not depend on the
   * count. No cycle, but the declaration order has to say so.
   */
  const columns = useGridColumns(PORTRAIT_COLUMNS, (c) => rowHeight(gridWidth, c));
  const gridRowHeight = rowHeight(gridWidth, columns);

  const [movies, setMovies] = useState<MovieSummary[] | null>(() => getVodMovies());
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
  const pages = useCategoryPages<MovieSummary>({ shape: search, columns, rowHeight: gridRowHeight });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDataRef = useRef(false);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!session) return;
      try {
        const cached = getVodMovies();
        const list = cached && !forceRefresh ? cached : await loadVodMovies(session.config, { forceRefresh });
        setMovies(list);

        const [raw, hidden] = await Promise.all([loadMovieCategories(session.provider.id, session.config), getHiddenCategoryIds("movie")]);
        const presentIds = new Set(list.map((m) => m.categoryId));
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
    const grouped = new Map<string, MovieSummary[]>();
    if (!movies) return grouped;
    const pool = search
      ? movies.filter((m) => m.name.toLowerCase().includes(search))
      : movies;
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
  }, [movies, search]);

  const itemsFor = useCallback(
    (categoryId: string) => byCategory.get(categoryId) ?? NOTHING,
    [byCategory]
  );

  /** Only for the count in the header, which is about the category being looked at. */
  const filteredMovies = useMemo(() => itemsFor(activeCategoryId), [itemsFor, activeCategoryId]);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  /*
    Stable on purpose, and the memo below is worthless without it.

    A `FlatList` builds a new render closure on every render of itself, and
    with `numColumns` above one it also hands each row a freshly allocated
    array. `CellRenderer` is a `PureComponent`, so both of those already
    fail reference equality — which is why every mounted cell re-rendered on
    every list render. A fast fling makes that happen inside the scroll
    handler itself, once per frame, which is the difference between the
    three per cent this list measures on a slow scroll and the twenty-two
    it measures on a fling.

    The cell can only bail out if what it is handed is identical, so the
    callbacks take the item rather than closing over it.
  */
  const openMovie = useCallback((movie: MovieSummary) => {
    router.push({ pathname: "/movies/details/[movieId]", params: { movieId: movie.providerItemId } });
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
      {/*
        Television only. On a phone this said the same word the tab under
        it already says, and spent a title row, a count row and their
        padding doing it — about 150dp of the screen before the first
        poster. The count moved beside the search field, which is the one
        place it is actually useful: it answers how much is left after
        what you just typed.
      */}
      {isTvBuild && (
        <ScreenHeader
          title={t("moviesCategories", "title")}
          showBack={false}
          subtitle={`${filteredMovies.length.toLocaleString()} ${t("moviesGrid", "moviesCountSuffix")}`}
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
      )}

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

          <View style={styles.searchRow}>
          <TextInput
            style={styles.search}
            placeholder={t("moviesGrid", "searchPlaceholder")}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={searchInput}
            onChangeText={setSearchInput}
          />
          <Text style={styles.searchCount}>{filteredMovies.length.toLocaleString()}</Text>
          </View>
        </>
      )}

      <BrowseLayout
        categories={categories}
        activeId={activeCategoryId}
        onSelect={setActiveCategoryId}
        progress={categoryDrag}
      >
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

    {movies === null ? (
      <View style={styles.centered}>
        {/* No spinner once a load has already failed — the retry button above is the way forward. */}
        {!errorMessage && <ActivityIndicator color={Brand.primary} />}
      </View>
    ) : (
      /*
        The category either side of this one is mounted and just off the
        edge, so a sideways drag reveals it coming in rather than swapping
        the content once the finger lifts. On the television it collapses to
        the single list it has always been — see `single`.
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
          <MoviePoster
            movie={item}
            columns={columns}
            artwork={pageActive}
            tvFocusFirst={index === 0 && !tvFocusClaimedRef.current}
            onTvFocus={claimTvFocus}
            onPress={openMovie}
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
      </BrowseLayout>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * Plain `Pressable`, no `entering` animation — see the note on
 * `ChannelRow` in live-categories.tsx: this grid holds the provider's whole
 * catalogue (~20k titles), and per-cell entrance animations plus per-cell
 * Reanimated values re-fire on every recycle during scroll, which is what
 * made scrolling stutter.
 */
/*
  Memoised. See `openMovie` for why, and for why this is only worth
  anything together with the stable callbacks above.

  `memo(function …)` rather than an arrow: `react/display-name` requires a
  named function here.
*/
const MoviePoster = memo(function MoviePoster({
  movie,
  columns,
  artwork,
  tvFocusFirst,
  onTvFocus,
  onPress,
}: {
  movie: MovieSummary;
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
  onPress: (movie: MovieSummary) => void;
}) {
  /*
    One closure for the life of this cell, rather than a new one handed
    down on every render of the list. That is what lets the memo bail.
  */
  const press = useCallback(() => onPress(movie), [onPress, movie]);
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
            {movie.name}
          </Text>
        </View>
        {movie.posterUrl && artwork && (
          <CachedImage uri={movie.posterUrl} style={styles.posterImage} resizeMode="cover" />
        )}
        {movie.rating !== null && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingBadgeText}>★ {movie.rating.toFixed(1)}</Text>
          </View>
        )}
        {/*
          The name, over the artwork rather than beneath it. The scrim is a
          flat translucent band, not a gradient: expo-linear-gradient is a
          native module and the only other place that wanted one solved it
          the same way, with stacked views.
        */}
        <ArtScrim />
        <View style={styles.posterTitleBox}>
          <Text style={styles.posterTitle} numberOfLines={2}>
            {movie.name}
          </Text>
        </View>
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

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  searchCount: {
    color: C.textMuted,
    fontSize: 12,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  search: {
    flex: 1,
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
  /*
   * Over the poster now, not under it. No height and no margin: the box is
   * pinned to the bottom edge of the artwork, so a one-line title and a
   * two-line title occupy the same row — which is what lets getItemLayout
   * promise one height for every row in the list.
   */
  posterTitleBox: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  posterTitle: {
    /* White, not the theme ink: this sits on artwork, not on the page. */
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  })
);
