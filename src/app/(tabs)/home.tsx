import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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

import { ArtScrim } from "@/components/ArtScrim";
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
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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

  function openFeatured(item: HomeItem) {
    if (item.contentType === "movie") {
      router.push({ pathname: "/movies/details/[movieId]", params: { movieId: item.providerItemId } });
    } else {
      router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: item.providerItemId } });
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
              <HeroCard item={hero} onPress={() => openFeatured(hero)} />
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

          {continueWatching.length > 0 && (
            <Animated.View entering={FadeInDown.delay(110).duration(380)}>
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
                  <PosterCard item={item} onPress={() => openFeatured(item)} />
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
                  <PosterCard item={item} onPress={() => openFeatured(item)} />
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
                  <PosterCard item={item} onPress={() => openFeatured(item)} />
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
                  <PosterCard item={item} onPress={() => openFeatured(item)} />
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
                  <PosterCard item={item} onPress={() => openFeatured(item)} />
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
        <ArtScrim />
        <View style={styles.featuredTitleBox}>
          <Text style={styles.featuredTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
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
function HeroCard({ item, onPress }: { item: HomeItem; onPress: () => void }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const { width, height } = useWindowDimensions();

  /*
   * A ceiling on the height, which only ever bites in landscape.
   *
   * The card is full width at 4:3, and on a phone turned sideways that is
   * 1800pt of hero on a 1080pt screen: it swallowed the window, pushed
   * every row off the bottom, and clipped its own title and play control
   * out of view. Portrait is unaffected — 4:3 of a phone's width is about
   * a third of its height, well under this.
   *
   * 42%, which leaves the header, a row and the bar with room. The image
   * is `cover`, so a capped card crops rather than distorts.
   */
  const maxHeight = Math.round(height * (width > height ? 0.42 : 0.6));

  return (
    <BouncePressable style={[styles.hero, { maxHeight }]} onPress={onPress}>
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

      {/* Bottom-up shade, so the title has something to sit on whatever the still is. */}
      <ArtScrim />

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
 * One card in a row: a poster, its rating, its name over the art.
 *
 * No fallback for a missing picture, because there is no such card here —
 * homeRows filters anything without usable artwork out before a row is
 * built. That is the rule for this screen: a browse grid has to show the
 * whole catalogue, blanks and all, but a recommendation with no picture is
 * not a recommendation.
 */
function PosterCard({ item, onPress }: { item: HomeItem; onPress: () => void }) {
  const [failed, setFailed] = useState(false);

  return (
      <BouncePressable style={styles.featuredCard} onPress={onPress}>
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
          {/*
            Over the artwork, as on the browse grids. With the name
            underneath, a two-line title made its card taller than its
            neighbours and the row went ragged; over the art every card in
            the rail is exactly a poster.
          */}
          <ArtScrim />
          <View style={styles.featuredTitleBox}>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {item.name}
            </Text>
          </View>
        </View>
      </BouncePressable>
  );
}

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
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FontFamily.extraBold,
    letterSpacing: 1.5,
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
  heroBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: Spacing.lg, gap: Spacing.xs },
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
    color: "#FFFFFF",
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 30,
    ...AndroidTextFix,
  },
  heroPlay: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "flex-start",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radii.md,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  heroPlayGlyph: { color: "#FFFFFF", fontSize: 11, ...AndroidTextFix },
  heroPlayText: { color: "#FFFFFF", fontFamily: FontFamily.semiBold, fontSize: 13, ...AndroidTextFix },

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
  featuredTitleBox: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  featuredTitle: {
    color: "#FFFFFF",
    fontSize: 10.5,
    lineHeight: 14,
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
