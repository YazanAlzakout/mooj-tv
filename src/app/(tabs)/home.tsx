import { router, useFocusEffect } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { CachedImage } from "@/components/CachedImage";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SectionHeader } from "@/components/SectionHeader";
import { BRAND } from "@/core/brand";
import { useI18n } from "@/core/i18n/I18nContext";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import {
  clearAllWatchProgress,
  getRecentWatchProgress,
  type WatchProgressEntry,
} from "@/db/repositories/watchProgressRepository";
import { clearActiveSession, getActiveSession } from "@/state/activeSessionStore";
import {
  featured as pickFeatured,
  hero as pickHero,
  moviesOnly as pickMovies,
  newThisYear as pickNewThisYear,
  seriesOnly as pickSeries,
  topRated as pickTopRated,
  currentYear,
  hasUsableArt,
  type HomeItem,
} from "@/core/home/homeRows";
import { getLibraryItems, type LibraryItem } from "@/db/repositories/libraryRepository";
import { getAllDownloadTasks, type DownloadTask } from "@/db/repositories/downloadRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";

/**
 * The name block under every poster card, to the pixel.
 *
 * Two lines at a fixed line height, always — see the note above
 * PosterCard. These two numbers and the box in the styles below are one
 * fact written twice; changing either alone is how a rail goes ragged.
 */
const CARD_TITLE_LINE_HEIGHT = 14;
const CARD_TITLE_LINES = 2;


function formatRelativeTime(t: ReturnType<typeof useI18n>["t"], timestamp: number): string {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return t("common", "justNow");
  if (diffMinutes < 60) return t("common", "minutesAgo", { n: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("common", "hoursAgo", { n: diffHours });
  return t("common", "daysAgo", { n: Math.floor(diffHours / 24) });
}

/**
 * How many cards a row offers.
 *
 * Twelve, because a row is a recommendation and a recommendation that runs
 * to fifty is a catalogue. The browse tabs are where the catalogue lives.
 */
const ROW_COUNT = 12;

export default function HomeScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const session = useMemo(() => getActiveSession(), []);
  const [continueWatching, setContinueWatching] = useState<WatchProgressEntry[]>([]);
  const [hero, setHero] = useState<HomeItem | null>(null);
  const [newRow, setNewRow] = useState<HomeItem[]>([]);
  const [featuredRow, setFeaturedRow] = useState<HomeItem[]>([]);
  const [topRow, setTopRow] = useState<HomeItem[]>([]);
  const [movieRow, setMovieRow] = useState<HomeItem[]>([]);
  const [seriesRow, setSeriesRow] = useState<HomeItem[]>([]);
  const [favouriteRow, setFavouriteRow] = useState<LibraryItem[]>([]);
  const [downloadRow, setDownloadRow] = useState<DownloadTask[]>([]);
  const [builtForProvider, setBuiltForProvider] = useState<string | null>(session?.provider.id ?? null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  /**
   * Forget everything the moment the account underneath changes.
   *
   * A tab screen is mounted once and kept. Connecting a different provider
   * does not take it down: `handleSelect` on the providers screen calls
   * `router.dismissAll()` and `router.replace("/home")`, and neither
   * unmounts a navigator that is already up. Every row on this screen was
   * built from the previous provider's catalogue, and `setActiveSession`
   * has already emptied the stores they came from — so without this the
   * screen would greet the viewer with account B's name over account A's
   * recommendations, with a hero that plays a stream on the wrong line.
   *
   * Checked during render rather than in an effect, which is the point:
   * React applies the reset before this render commits, so the wrong rows
   * are never painted. The focus effect below then refills them from the
   * new catalogue. Same pattern, same reason, as the three browse grids.
   */
  if (builtForProvider !== (session?.provider.id ?? null)) {
    setBuiltForProvider(session?.provider.id ?? null);
    setContinueWatching([]);
    setHero(null);
    setNewRow([]);
    setFeaturedRow([]);
    setTopRow([]);
    setMovieRow([]);
    setSeriesRow([]);
    setFavouriteRow([]);
    setDownloadRow([]);
  }

  const year = useMemo(() => currentYear(), []);

  const refreshContinueWatching = useCallback(() => {
    getRecentWatchProgress(10).then(setContinueWatching);
  }, []);

  /*
   * Everything the screen shows is rebuilt on focus, not on mount.
   *
   * A tab stays mounted while the viewer stars something, downloads
   * something or finishes an episode three screens away, and a home screen
   * that only read the database on its first visit would be stale for the
   * rest of the session — which is the state the rows most worth having are
   * in most of the time.
   *
   * The catalogue rows go through homeRows, which scans the lineup once and
   * caches against the arrays themselves, so returning here repeatedly
   * costs a lookup rather than a walk over 26,000 titles.
   */
  useFocusEffect(
    useCallback(() => {
      refreshContinueWatching();
      setHero(pickHero());
      setNewRow(pickNewThisYear(ROW_COUNT));
      setFeaturedRow(pickFeatured(ROW_COUNT));
      setTopRow(pickTopRated(ROW_COUNT));
      setMovieRow(pickMovies(ROW_COUNT));
      setSeriesRow(pickSeries(ROW_COUNT));
      getLibraryItems("favorite").then((items) => setFavouriteRow(items.slice(0, ROW_COUNT)));
      if (downloadsSupported()) {
        getAllDownloadTasks().then((tasks) =>
          setDownloadRow(tasks.filter((d) => d.status === "completed").slice(0, ROW_COUNT))
        );
      }
    }, [refreshContinueWatching])
  );

  useEffect(() => {
    if (!session) router.replace("/");
  }, [session]);

  /*
   * Stable, so the memoised cards below can bail out.
   *
   * Above the early return, because a hook after one is a hook that is
   * not always called.
   *
   * Every row on this screen re-renders whenever the screen does, and the
   * screen re-renders on every rotation — about a hundred cards rebuilt to
   * resize one hero. Handing each card a fresh `() => openFeatured(item)`
   * made that unavoidable; taking the item as an argument instead means
   * the prop is identical from one render to the next and `memo` can do
   * its job. Shorter re-render, shorter stale frame.
   */
  const openFeatured = useCallback((item: HomeItem) => {
    if (item.contentType === "movie") {
      router.push({ pathname: "/movies/details/[movieId]", params: { movieId: item.providerItemId } });
    } else {
      router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: item.providerItemId } });
    }
  }, []);

  if (!session) {
    return null;
  }

  function disconnect() {
    clearActiveSession();
    router.replace("/providers");
  }

  function resumeWatching(entry: WatchProgressEntry) {
    if (entry.contentType === "movie") {
      router.push({ pathname: "/movies/player/[movieId]", params: { movieId: entry.providerItemId } });
    } else {
      router.push({
        pathname: "/series/player/[episodeId]",
        params: {
          episodeId: entry.providerItemId,
          containerExtension: entry.containerExtension,
          title: entry.title,
          imageUrl: entry.imageUrl ?? "",
          seriesId: entry.seriesId ?? "",
          seasonNumber: entry.seasonNumber !== null ? String(entry.seasonNumber) : "",
          episodeNumber: entry.episodeNumber !== null ? String(entry.episodeNumber) : "",
        },
      });
    }
  }



  return (
    /* The drifting particles run entirely on the native thread (Reanimated
       mutates the views directly — no React re-renders, no JS-thread work
       per frame), so they cost the scrolling rails below nothing. Kept to a
       low count regardless: this is a background accent, not an effect. */
    <ScreenBackground particles>
      {/* No bottom edge: the tab bar below already clears the gesture area,
          and asking for it here too leaves a second empty strip. */}
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Image
              source={brandLogoSource()}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.brandText}>
              <Text style={styles.brandName}>{BRAND.wordmark}</Text>
              <Text style={styles.welcome} numberOfLines={2}>
                {t("home", "welcomeBack")} · {session.provider.name}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <BouncePressable
                style={styles.headerIconButton}
                onPress={() => router.push("/search")}
                accessibilityLabel={t("home", "search")}
              >
                <Text style={styles.headerIconText}>⌕</Text>
              </BouncePressable>
              <BouncePressable
                style={styles.disconnectButton}
                onPress={() => setConfirmDisconnect(true)}
                accessibilityLabel={t("settings", "disconnect")}
              >
                {/*
                  "✕", not the power symbol "⏻": that glyph is absent from
                  Noto Kufi Arabic *and* from Android's fallback chain, so it
                  rendered as an empty tofu box on the device. This one is in
                  every font the app can land on.
                */}
                <Text style={styles.disconnectButtonText}>✕</Text>
              </BouncePressable>
            </View>
          </Animated.View>

          {hero && (
            <Animated.View entering={FadeInDown.delay(40).duration(420)}>
              <HeroCard item={hero} onPress={openFeatured} />
            </Animated.View>
          )}

          {/*
            Rows, each of which disappears when it has nothing to say.

            An empty row is worse than a missing one: it spends a heading, a
            card-height of screen and a scroll on telling the viewer that
            there is nothing here. The screen that was here before kept a
            "Continue watching" heading over an empty box permanently, which
            is how a home screen ends up mostly furniture.
          */}

          {newRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(180).duration(380)}>
              {/* The year is the point of the row, so it is in the heading. */}
              <SectionHeader title={`${t("home", "newIn")} ${year}`} />
              <FlatList
                {...NO_CLIP}
                data={newRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {topRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(215).duration(380)}>
              <SectionHeader title={t("home", "topRated")} />
              <FlatList
                {...NO_CLIP}
                data={topRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {movieRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(250).duration(380)}>
              <SectionHeader
                title={t("home", "movies")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/movies-categories") }}
              />
              <FlatList
                {...NO_CLIP}
                data={movieRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {seriesRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(285).duration(380)}>
              <SectionHeader
                title={t("home", "series")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/series-categories") }}
              />
              <FlatList
                {...NO_CLIP}
                data={seriesRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {favouriteRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(250).duration(380)}>
              <SectionHeader
                title={t("home", "favorites")}
                action={{
                  label: t("home", "seeAll"),
                  onPress: () =>
                    router.push({
                      pathname: "/library/[listType]",
                      params: { listType: "favorite" },
                    }),
                }}
              />
              <FlatList
                {...NO_CLIP}
                data={favouriteRow}
                keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <SavedCard
                    title={item.title}
                    imageUrl={item.imageUrl}
                    onPress={() =>
                      router.push({
                        pathname: "/library/[listType]",
                        params: { listType: "favorite" },
                      })
                    }
                  />
                )}
              />
            </Animated.View>
          )}

          {downloadRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(320).duration(380)}>
              <SectionHeader
                title={t("home", "downloads")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/downloads") }}
              />
              <FlatList
                {...NO_CLIP}
                data={downloadRow}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <SavedCard
                    title={item.title}
                    imageUrl={item.imageUrl}
                    onPress={() => router.push("/downloads")}
                  />
                )}
              />
            </Animated.View>
          )}

          {featuredRow.length > 0 && (
            <Animated.View entering={FadeInDown.delay(390).duration(380)}>
              <SectionHeader title={t("home", "featured")} />
              <FlatList
                {...NO_CLIP}
                data={featuredRow}
                keyExtractor={(item) => item.key}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <PosterCard item={item} onPress={openFeatured} />
                )}
              />
            </Animated.View>
          )}

          {/*
            Last, not second.

            A resume row is the fastest way back into something already
            started, which is the argument for putting it at the top — and
            it is the wrong argument for this screen. Second place is where
            the eye lands after the hero, and giving it to a row of things
            the viewer has already seen means the screen opens on the past.
            Everything above this offers something new; this is the one row
            that offers something old, so it closes the screen rather than
            fronting it. Anyone looking for it knows it is there.

            Its entrance delay goes last with it — the cascade reads top to
            bottom or it reads as a mistake.
          */}
          {continueWatching.length > 0 && (
            <Animated.View entering={FadeInDown.delay(430).duration(380)}>
              <SectionHeader
                title={t("home", "continueWatching")}
                action={{ label: t("home", "seeAll"), onPress: () => router.push("/history") }}
                secondaryAction={{
                  label: t("home", "clear"),
                  onPress: () => setConfirmClearHistory(true),
                  destructive: true,
                }}
              />
              <FlatList
                {...NO_CLIP}
                data={continueWatching}
                keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => (
                  <ContinueWatchingCard entry={item} onPress={() => resumeWatching(item)} />
                )}
              />
            </Animated.View>
          )}

        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmDisconnect}
        title={t("settings", "disconnect")}
        message={t("settings", "disconnectConfirmBody")}
        confirmLabel={t("settings", "disconnect")}
        danger
        onConfirm={() => {
          setConfirmDisconnect(false);
          disconnect();
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />

      <ConfirmDialog
        visible={confirmClearHistory}
        title={t("home", "clearHistoryTitle")}
        message={t("home", "clearHistoryBody")}
        confirmLabel={t("home", "clear")}
        danger
        onConfirm={async () => {
          setConfirmClearHistory(false);
          await clearAllWatchProgress();
          refreshContinueWatching();
        }}
        onCancel={() => setConfirmClearHistory(false)}
      />

    </ScreenBackground>
  );
}

/**
 * A card for the rows that come out of the database rather than the
 * catalogue: things the viewer saved or downloaded.
 *
 * Those rows carry their own stored image, which can be absent on a row
 * the viewer built before the artwork was available — so unlike PosterCard
 * this one does have a fallback, and it has to: dropping a title somebody
 * explicitly saved, because its picture is missing, would be losing their
 * work to a cosmetic rule.
 */
function SavedCard({
  title,
  imageUrl,
  onPress,
}: {
  title: string;
  imageUrl: string | null;
  onPress: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const showArt = !failed && hasUsableArt(imageUrl);

  return (
    <BouncePressable style={styles.featuredCard} onPress={onPress}>
      <View style={styles.featuredImageWrap}>
        {showArt ? (
          <CachedImage
            uri={imageUrl}
            style={styles.featuredImage}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={styles.featuredFallback} />
        )}
      </View>
      <View style={styles.featuredTitleBox}>
        <Text style={styles.featuredTitle} numberOfLines={CARD_TITLE_LINES}>
          {title}
        </Text>
      </View>
    </BouncePressable>
  );
}

/**
 * The lead title, and the reason this screen stopped looking like a menu.
 *
 * A home screen whose first element is a row of small cards reads as a
 * directory — everything the same size means nothing is being recommended.
 * One large still with a title over it is an editorial choice: it says
 * *this one*, and the rail underneath becomes "and these too" rather than
 * a list that happens to start somewhere.
 *
 * The scrim is three stacked translucent views rather than a gradient.
 * `expo-linear-gradient` is a native module and this is the only place in
 * the app that would need it; three bands with rising alpha produce a step
 * nobody can see at this size, and the comment on CategoryColors records
 * the same decision being taken once before.
 */
function HeroCard({
  item,
  onPress,
}: {
  item: HomeItem;
  /** Takes the item, like the cards below — one function for the screen. */
  onPress: (item: HomeItem) => void;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const press = useCallback(() => onPress(item), [onPress, item]);
  const { width, height } = useWindowDimensions();

  /**
   * A ceiling on the height — two of them, and the second one is about a
   * single frame.
   *
   * The first is the obvious one. The card is full width at 4:3, and on a
   * phone turned sideways that is 1800pt of hero on a 1080pt screen: it
   * swallowed the window, pushed every row off the bottom, and clipped its
   * own title and play control out of view. 42% leaves the header, a row
   * and the bar with room.
   *
   * ## The second one, and why it is a fraction of the width
   *
   * `useWindowDimensions` lags the window. Android resizes the activity
   * and lays the view tree out at the new size immediately, but the new
   * numbers reach JavaScript an event later — so for a frame or two after
   * a rotation this hero is drawn *at the landscape width* while still
   * being capped by the *portrait height*. Caught in a screenshot on
   * 2026-11-08: 873dp of hero in a 393dp window, the greeting shoved under
   * the status bar and nothing else on screen. That is the "لحظة الشاشة ما
   * بتكون طبيعية" during a turn.
   *
   * The frame itself cannot be removed from here — every dimension this
   * component can read is stale in it. What can be removed is how bad it
   * looks, and the trick is to cap against the *width* as well, because
   * after a turn the stale width is the new height.
   *
   * It never bites in portrait, at any screen size: the hero's natural
   * height is 0.75 of its container, the container is the window less the
   * page padding, so the natural height is always below 0.78 of the window
   * width. It only ever applies in the frame where the two disagree.
   */
  const maxHeight = Math.min(
    Math.round(height * (width > height ? 0.42 : 0.6)),
    Math.round(width * 0.78)
  );

  return (
    <BouncePressable style={styles.heroCard} onPress={press}>
      <View style={[styles.hero, { maxHeight }]}>
        {!failed ? (
          <CachedImage
            uri={item.posterUrl}
            style={styles.heroImage}
            resizeMode="cover"
            priority="high"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[styles.heroImage, styles.heroFallback]} />
        )}

      </View>

      {/*
        Under the still, not over it.

        The hero had the same collision as the cards, and worse for being
        large: "They Fight (2026)" set across the poster's own THEY FIGHT.
        Below the picture the title has the page to itself, the shade that
        was holding it up is gone, and the still is a still.
      */}
      <View style={styles.heroBody}>
        <View style={styles.heroMeta}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {item.contentType === "movie" ? t("home", "movies") : t("home", "series")}
            </Text>
          </View>
          {item.rating !== null && (
            <Text style={styles.heroRating}>★ {item.rating.toFixed(1)}</Text>
          )}
        </View>

        <Text style={styles.heroTitle} numberOfLines={2}>
          {item.name}
        </Text>

        <View style={styles.heroPlay}>
          <Text style={styles.heroPlayGlyph}>▶</Text>
          <Text style={styles.heroPlayText}>{t("movieDetails", "play")}</Text>
        </View>
      </View>
    </BouncePressable>
  );
}

/**
 * No `entering` animation: the rails are horizontal FlatLists, so cards
 * recycle as they scroll and an entrance would re-fire each time — a card
 * would fade in again every time it came back round, which reads as a
 * glitch rather than as motion.
 *
 * Home's entrance motion therefore lives on things that mount exactly
 * once. That used to mean the browse cards and the quick-action grid;
 * those moved to the tab bar and the more screen, so it is now the header
 * and the two section wrappers, each a beat behind the last.
 */
/**
 * Why no card in this app prints a title on its artwork any more.
 *
 * Almost every poster a provider sends already has the title printed on
 * it, usually across the bottom third, because that is what a film poster
 * is. Drawing our own name on top of that produces two titles in the same
 * place in two different typefaces — and on a screenshot of the home
 * screen taken on 2026-11-08, that was six cards out of nine: "Another
 * Life" over ANOTHER LIFE, "Biohackers" over BIOHACKERS, "الجواهرجى" over
 * its own Arabic lettering. Unreadable, and unmistakably a mistake.
 *
 * So the name moves under the card, which has a second effect worth as
 * much: the dark wash existed *only* to keep white text readable over
 * artwork. With the text gone the wash goes too, and the poster is seen
 * whole — the same change, and the same reason, as the channel logos.
 *
 * The cost is the one the old comment named: a two-line name under a card
 * makes that card taller than its neighbours and the row goes ragged. The
 * answer is the one the channel grid already uses — a name box of a fixed
 * height, two lines whether the name needs one or two, so every card in a
 * rail is exactly the same height and every grid row is exactly
 * `rowHeight()`.
 */

/**
 * One card in a row: a poster, its rating, its name underneath.
 *
 * No fallback for a missing picture, because there is no such card here —
 * homeRows filters anything without usable artwork out before a row is
 * built. That is the rule for this screen: a browse grid has to show the
 * whole catalogue, blanks and all, but a recommendation with no picture is
 * not a recommendation.
 */
const PosterCard = memo(function PosterCard({
  item,
  onPress,
}: {
  item: HomeItem;
  /** Takes the item, so one function serves every card — see openFeatured. */
  onPress: (item: HomeItem) => void;
}) {
  const [failed, setFailed] = useState(false);
  const press = useCallback(() => onPress(item), [onPress, item]);

  return (
      <BouncePressable style={styles.featuredCard} onPress={press}>
        <View style={styles.featuredImageWrap}>
          {!failed ? (
            <CachedImage
              uri={item.posterUrl}
              style={styles.featuredImage}
              resizeMode="cover"
              onError={() => setFailed(true)}
            />
          ) : (
            /*
              A plain tile, with no text in it.
              
              It used to carry the name, because the title then sat under
              the card and a card with no art was a blank box. The title is
              over the art now, so the name is already there — and a card
              whose poster failed was printing it twice, once greyed in the
              middle and once white at the foot.
            */
            <View style={styles.featuredFallback} />
          )}
          {item.rating !== null && (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingBadgeText}>★ {item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {/* Under the poster, not on it — see the note above PosterCard. */}
        <View style={styles.featuredTitleBox}>
          <Text style={styles.featuredTitle} numberOfLines={CARD_TITLE_LINES}>
            {item.name}
          </Text>
        </View>
      </BouncePressable>
  );
});

/** No `entering` animation — same reasoning as `FeaturedCard` above. */
function ContinueWatchingCard({ entry, onPress }: { entry: WatchProgressEntry; onPress: () => void }) {
  const { t } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);
  const progress = entry.durationSeconds > 0 ? entry.positionSeconds / entry.durationSeconds : 0;

  return (
      <BouncePressable style={styles.continueCard} onPress={onPress}>
        <View style={styles.continueImageWrap}>
          {entry.imageUrl && !imageFailed ? (
            <CachedImage
              uri={entry.imageUrl}
              style={styles.continueImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View style={styles.continueImageFallback}>
              <Text style={styles.continueImageFallbackText}>{entry.title.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Text style={styles.playCircleText}>▶</Text>
            </View>
          </View>
          <View style={styles.continueProgressTrack}>
            <View style={[styles.continueProgressFill, { width: `${Math.min(1, progress) * 100}%` }]} />
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {entry.contentType === "episode" && entry.seasonNumber !== null && entry.episodeNumber !== null
            ? `S${entry.seasonNumber} E${entry.episodeNumber} · ${formatRelativeTime(t, entry.updatedAt)}`
            : formatRelativeTime(t, entry.updatedAt)}
        </Text>
      </BouncePressable>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

  /**
   * One tight lockup — logo, wordmark and greeting read as a single unit
   * instead of three blocks stacked down the screen with dead space
   * between them. The greeting folds the provider name onto its own line
   * rather than giving it a third orphan row.
   */
  /**
   * The negative insets pull against the scroll view's own 16pt page
   * padding and against the logo artwork's built-in transparent margin —
   * the PNG is a square with the mark floating inside it, so the *visible*
   * logo always sits further in than its box does. Without this the mark
   * looked indented from the edge and the wordmark looked detached from
   * it, even though the box and the text were already adjacent.
   */
  /*
   * No negative margins. The ones that were here pulled a wordmark PNG
   * back into place — that file carried a wide band of transparent padding
   * and had to be dragged out of it. Mooj's mark is a sphere cropped to its
   * own edge, so the same pull dragged a 144pt circle off the top-left
   * corner of the screen and over the status bar.
   */
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  /**
   * The negative vertical margin is against the artwork, not the layout:
   * the PNG is a 499×500 square with the mark floating in the middle, so a
   * 144pt box reserves a band of empty transparent pixels above and below
   * it. Letting the box bleed past the row's height reclaims that band —
   * the visible mark keeps its size, the dead space around it does not
   * push the rest of the screen down.
   */
  logo: { width: 40, height: 40 },
  brandText: { flex: 1, gap: 2, marginEnd: Spacing.sm },
  brandName: {
    color: C.text,
    fontSize: 17,
    lineHeight: 24,
    fontFamily: FontFamily.extraBold,
    /*
     * Loose tracking is a capitals trick: it opens up a word that has no
     * ascenders or descenders to give it shape. A mixed-case wordmark has
     * both, so the same 1.5 simply pulled the letters apart. Half of it,
     * and a point larger to keep the old optical weight.
     */
    letterSpacing: 0.4,
    ...AndroidTextFix,
  },
  welcome: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    ...AndroidTextFix,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconText: { color: C.textSecondary, fontSize: 18, fontFamily: FontFamily.medium },
  /**
   * Its own tinted style rather than the neutral icon button: this ends the
   * session, and looking identical to Search made it easy to hit without
   * noticing.
   */
  /*
   * Quieter than it was. This disconnects the provider — it empties the
   * library, the history and the lineup — and it was drawn as a filled
   * accent circle in the second most prominent position on the screen,
   * which is where a primary action goes, not a destructive one.
   */
  disconnectButton: {
    width: 34,
    height: 34,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  disconnectButtonText: { color: C.textMuted, fontSize: 14, fontFamily: FontFamily.medium },



  /**
   * A right-pointing triangle built from borders: zero-size box, a solid
   * start border for the body of the shape and transparent top/bottom
   * borders for its slopes.
   */
  /**
   * Portrait only. Landscape already has narrower cards and shorter rows,
   * so the same figure carries the card there rather than crowding it.
   */

  /**
   * An explicit percentage width per card, not `flexBasis` + `flexGrow`
   * (which only wraps to a given count incidentally, depending on how much
   * space is left after rounding): two per row in portrait, all four on one
   * row in landscape, where the screen is twice as wide and half as tall
   * and a 2×2 block of tall cards ate most of the viewport.
   */
  /**
   * Sized down by roughly a quarter, and most of what went was the empty
   * frame rather than the content: the vertical padding was `xl` on both
   * sides, which put more dead space in the card than icon and label
   * together.
   */
  /** Four across, and shorter: landscape has height to spare nowhere. */
  /**
   * The card shrank; the symbol did not — it grew. What the smaller card
   * reclaimed was the empty frame around the icon, not the icon itself,
   * which is the part that has to be readable at a glance.
   */

  hero: {
    width: "100%",
    /*
     * 4:3, not 16:10. The lead title is the one picture on the screen that
     * is allowed to be a picture rather than a thumbnail, and at 16:10 a
     * poster — which is portrait — was being cropped to a letterbox strip
     * of its middle. Taller gives back the part of the frame the artwork
     * was composed around, and gives the screen something to open on.
     */
    aspectRatio: 4 / 3,
    borderRadius: Radii.xl,
    overflow: "hidden",
    /* No marginBottom: scrollContent already puts a gap between its
       children, and the two together left a visible hole under the hero. */
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  heroImage: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  heroFallback: { backgroundColor: C.surfaceElevated },
  /** The picture and the block under it, as one pressable. */
  heroCard: { width: "100%" },
  /*
   * In flow now rather than absolutely placed over the picture. No side
   * padding either: the title lines up with the section headings below it
   * instead of being inset from the artwork's edge, which is what tells
   * the eye it belongs to the page rather than to the image.
   */
  heroBody: { paddingTop: Spacing.sm, gap: Spacing.xs },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  heroBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.sm,
    backgroundColor: Brand.primary,
  },
  heroBadgeText: { color: "#02121F", fontFamily: FontFamily.bold, fontSize: 10.5, ...AndroidTextFix },
  heroRating: { color: "#F6C445", fontFamily: FontFamily.semiBold, fontSize: 12, ...AndroidTextFix },
  heroTitle: {
    /* On the page now, so it takes the page's ink rather than a hard white. */
    color: C.text,
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 30,
    ...AndroidTextFix,
  },
  /*
   * A solid button now, not a frosted panel. The translucent white was
   * reading as glass over a picture; on the page it would just be a grey
   * box, and the one thing on this screen the viewer is being invited to
   * press should look pressable.
   */
  heroPlay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 9,
    borderRadius: Radii.md,
    backgroundColor: Brand.primary,
  },
  heroPlayGlyph: { color: "#02121F", fontSize: 11, ...AndroidTextFix },
  heroPlayText: { color: "#02121F", fontFamily: FontFamily.bold, fontSize: 13, ...AndroidTextFix },

  rail: { gap: Spacing.md, paddingEnd: Spacing.lg },

  continueCard: { width: 150 },
  continueImageWrap: {
    width: 150,
    aspectRatio: 16 / 9,
    borderRadius: Radii.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    position: "relative",
  },
  continueImage: { width: "100%", height: "100%" },
  continueImageFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceElevated,
  },
  continueImageFallbackText: { color: C.textSecondary, fontSize: 22, fontFamily: FontFamily.bold },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(229,9,20,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  playCircleText: { color: "#fff", fontSize: 13, marginStart: 2 },
  continueProgressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  continueProgressFill: { height: "100%", backgroundColor: Brand.primary },

  featuredCard: { width: 116 },
  /*
   * A fixed height, not a minimum. Two lines whether the name needs one or
   * two, so every card in a rail ends at the same place — see the note
   * above PosterCard for what a ragged rail looks like.
   */
  featuredTitleBox: {
    height: CARD_TITLE_LINE_HEIGHT * CARD_TITLE_LINES,
    marginTop: Spacing.xs,
    paddingHorizontal: 2,
  },
  featuredTitle: {
    color: C.textSecondary,
    fontSize: 10.5,
    lineHeight: CARD_TITLE_LINE_HEIGHT,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  featuredImageWrap: {
    width: 116,
    aspectRatio: 2 / 3,
    borderRadius: Radii.md,
    overflow: "hidden",
    backgroundColor: C.surface,
    position: "relative",
  },
  featuredImage: { width: "100%", height: "100%" },
  featuredFallback: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.sm,
    backgroundColor: C.surfaceElevated,
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

  cardTitle: { color: C.text, fontSize: 12, fontFamily: FontFamily.medium, marginTop: Spacing.xs },
  cardSubtitle: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },
  })
);
