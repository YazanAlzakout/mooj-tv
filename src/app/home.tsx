import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { FlatList, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { CachedImage } from "@/components/CachedImage";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SectionHeader } from "@/components/SectionHeader";
import { useI18n } from "@/core/i18n/I18nContext";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { AndroidTextFix, Brand, CategoryColors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { getAppState, type AppState } from "@/db/repositories/appStateRepository";
import { getDownloadsSummary } from "@/db/repositories/downloadRepository";
import { getLibraryCount } from "@/db/repositories/libraryRepository";
import { getLiveTvState } from "@/db/repositories/liveTvStateRepository";
import {
  clearAllWatchProgress,
  getRecentWatchProgress,
  type WatchProgressEntry,
} from "@/db/repositories/watchProgressRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";
import { clearActiveSession, getActiveSession } from "@/state/activeSessionStore";
import { getSeriesList } from "@/state/seriesStore";
import { getVodMovies } from "@/state/vodStore";

function formatRelativeTime(t: ReturnType<typeof useI18n>["t"], timestamp: number): string {
  const diffMinutes = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMinutes < 1) return t("common", "justNow");
  if (diffMinutes < 60) return t("common", "minutesAgo", { n: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return t("common", "hoursAgo", { n: diffHours });
  return t("common", "daysAgo", { n: Math.floor(diffHours / 24) });
}

interface FeaturedItem {
  contentType: "movie" | "series";
  providerItemId: string;
  name: string;
  posterUrl: string;
  rating: number | null;
}

const FEATURED_COUNT = 12;

/**
 * Shuffled once per screen focus (never in render — master prompt §17's
 * "no expensive full-data reshuffle on every render"). Only draws from
 * catalogs already cached in memory (getVodMovies/getSeriesList) — Home
 * deliberately never triggers a fresh fetch of the full VOD/series catalog
 * just to populate this shelf, so on a session where Movies/Series haven't
 * been opened yet, Featured is simply empty rather than showing fabricated
 * or eagerly-fetched content.
 */
function pickFeatured(): FeaturedItem[] {
  const movies = getVodMovies() ?? [];
  const series = getSeriesList() ?? [];
  const total = movies.length + series.length;
  if (total === 0) return [];

  /*
   * Draws FEATURED_COUNT distinct random positions instead of copying and
   * shuffling the catalog. The previous version built ~26,000 objects and
   * ran a full Fisher-Yates over them to keep 12 — synchronously, inside
   * `useFocusEffect`, so every single return to Home paid for it during the
   * navigation transition.
   *
   * Indices are drawn across both lists at once, so the mix stays
   * proportional to their sizes without concatenating them.
   */
  const picked = new Set<number>();
  const wanted = Math.min(FEATURED_COUNT, total);
  // Bounded: worst case is a catalog barely larger than FEATURED_COUNT, and
  // the attempt cap keeps even that from spinning.
  for (let attempts = 0; picked.size < wanted && attempts < wanted * 20; attempts++) {
    picked.add(Math.floor(Math.random() * total));
  }

  const out: FeaturedItem[] = [];
  for (const index of picked) {
    if (index < movies.length) {
      const m = movies[index];
      if (m.posterUrl) {
        out.push({
          contentType: "movie",
          providerItemId: m.providerItemId,
          name: m.name,
          posterUrl: m.posterUrl,
          rating: m.rating,
        });
      }
    } else {
      const sItem = series[index - movies.length];
      if (sItem?.posterUrl) {
        out.push({
          contentType: "series",
          providerItemId: sItem.providerItemId,
          name: sItem.name,
          posterUrl: sItem.posterUrl,
          rating: sItem.rating,
        });
      }
    }
  }
  return out;
}

export default function HomeScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const session = useMemo(() => getActiveSession(), []);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [movieCount, setMovieCount] = useState<number | null>(null);
  const [seriesCount, setSeriesCount] = useState<number | null>(null);
  const [continueWatching, setContinueWatching] = useState<WatchProgressEntry[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [watchLaterCount, setWatchLaterCount] = useState(0);
  const [downloadsCount, setDownloadsCount] = useState(0);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refreshContinueWatching = useCallback(() => {
    getRecentWatchProgress(10).then(setContinueWatching);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setMovieCount(getVodMovies()?.length ?? null);
      setSeriesCount(getSeriesList()?.length ?? null);
      refreshContinueWatching();
      getLibraryCount("favorite").then(setFavoriteCount);
      getLibraryCount("watch_later").then(setWatchLaterCount);
      getDownloadsSummary().then((s) => setDownloadsCount(s.count));
      getAppState().then(setAppState);
      setFeatured(pickFeatured());
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

  /**
   * With the modern layout on, the channel grid is not a step on the way to
   * watching — the split view carries its own category strip and channel
   * list, so stopping at the grid first would just be the old flow wearing
   * a new coat. Straight to the player, on the channel last watched (or the
   * first one on a fresh install), already playing.
   */
  async function openLiveTv() {
    /*
     * A television always goes to the channel list — the category rail
     * beside the grid is the only TV layout, resolved 2026-09-10 after the
     * three selectable modes were removed (they were a settings choice the
     * viewer had to discover, and two of them made the remote worse rather
     * than better). `splitChannelView` describes the phone's portrait
     * stack and never applies here.
     */
    if (isTvBuild) {
      router.push("/live-categories");
      return;
    }

    if (!session || !appState?.splitChannelView) {
      router.push("/live-categories");
      return;
    }
    const liveState = await getLiveTvState().catch(() => null);
    const target =
      session.channels.find((c) => c.providerItemId === liveState?.lastChannelId) ?? session.channels[0];
    if (!target) {
      router.push("/live-categories");
      return;
    }
    router.push({
      pathname: "/live/player/[channelId]",
      params: { channelId: target.providerItemId, categoryId: liveState?.lastCategoryId ?? "all" },
    });
  }

  function openFeatured(item: FeaturedItem) {
    if (item.contentType === "movie") {
      router.push({ pathname: "/movies/details/[movieId]", params: { movieId: item.providerItemId } });
    } else {
      router.push({ pathname: "/series/details/[seriesId]", params: { seriesId: item.providerItemId } });
    }
  }

  const showLive = appState?.liveSectionVisible ?? true;
  const showMovies = appState?.moviesSectionVisible ?? true;
  const showSeries = appState?.seriesSectionVisible ?? true;
  const anyBrowseVisible = showLive || showMovies || showSeries;

  return (
    /* The drifting particles run entirely on the native thread (Reanimated
       mutates the views directly — no React re-renders, no JS-thread work
       per frame), so they cost the scrolling rails below nothing. Kept to a
       low count regardless: this is a background accent, not an effect. */
    <ScreenBackground particles>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
            <Image
              source={brandLogoSource()}
              style={styles.logo}
              resizeMode="contain"
            />
            <View style={styles.brandText}>
              <Text style={styles.brandName}>ALBASERA</Text>
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

          {anyBrowseVisible && (
            <>
              <SectionHeader title={t("home", "browse")} />
              <View style={styles.browseRow}>
                {showLive && (
                  <BrowseCard
                    label={t("home", "liveTV")}
                    count={session.channels.length.toLocaleString()}
                    icon={<TvIcon />}
                    landscape={isLandscape}
                    color={CategoryColors.live}
                    delay={80}
                    onPress={openLiveTv}
                  />
                )}
                {showMovies && (
                  <BrowseCard
                    label={t("home", "movies")}
                    count={movieCount !== null ? movieCount.toLocaleString() : "—"}
                    icon={<Text style={styles.browseGlyph}>▶</Text>}
                    landscape={isLandscape}
                    color={CategoryColors.movies}
                    delay={160}
                    onPress={() => router.push("/movies-categories")}
                  />
                )}
                {showSeries && (
                  <BrowseCard
                    label={t("home", "series")}
                    count={seriesCount !== null ? seriesCount.toLocaleString() : "—"}
                    icon={<CameraIcon />}
                    landscape={isLandscape}
                    color={CategoryColors.series}
                    delay={240}
                    onPress={() => router.push("/series-categories")}
                  />
                )}
              </View>
            </>
          )}

          <SectionHeader title={t("home", "quickActions")} />
          <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.actionsRow}>
            <ActionCard
              landscape={isLandscape}
              glyph="★"
              tint="#EC4899"
              label={t("home", "favorites")}
              count={favoriteCount}
              onPress={() => router.push({ pathname: "/library/[listType]", params: { listType: "favorite" } })}
            />
            <ActionCard
              landscape={isLandscape}
              glyph="◷"
              tint="#F59E0B"
              label={t("home", "watchLater")}
              count={watchLaterCount}
              onPress={() => router.push({ pathname: "/library/[listType]", params: { listType: "watch_later" } })}
            />
            {downloadsSupported() && (
              <ActionCard
                landscape={isLandscape}
                glyph="⬇"
                tint="#06B6D4"
                label={t("home", "downloads")}
                count={downloadsCount}
                onPress={() => router.push("/downloads")}
              />
            )}
            <ActionCard
              landscape={isLandscape}
              glyph="⚙"
              tint="#8B5CF6"
              label={t("home", "settings")}
              onPress={() => router.push("/settings")}
            />
          </Animated.View>

          {featured.length > 0 && (
            <>
              <SectionHeader title={t("home", "featured")} />
              <FlatList
        {...NO_CLIP}
                data={featured}
                keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => <FeaturedCard item={item} onPress={() => openFeatured(item)} />}
              />
            </>
          )}

          <SectionHeader
            title={t("home", "continueWatching")}
            action={
              continueWatching.length > 0
                ? { label: t("home", "seeAll"), onPress: () => router.push("/history") }
                : undefined
            }
            secondaryAction={
              continueWatching.length > 0
                ? { label: t("home", "clear"), onPress: () => setConfirmClearHistory(true), destructive: true }
                : undefined
            }
          />

          {continueWatching.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyGlyph}>▷</Text>
              <Text style={styles.emptyCardText}>{t("home", "noWatchHistory")}</Text>
            </View>
          ) : (
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
 * No `entering` animation: the rails are horizontal FlatLists, so cards
 * recycle as they scroll and an entrance would re-fire each time. Home's
 * entrance motion lives on the fixed elements above (header, browse cards,
 * quick actions), which mount exactly once.
 */
function FeaturedCard({ item, onPress }: { item: FeaturedItem; onPress: () => void }) {
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
            <View style={styles.featuredFallback}>
              <Text style={styles.featuredFallbackText} numberOfLines={3}>
                {item.name}
              </Text>
            </View>
          )}
          {item.rating !== null && (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingBadgeText}>★ {item.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.name}
        </Text>
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

/**
 * Live TV and Series are drawn from plain views rather than picked out of
 * the font. There is no monochrome character in Unicode for "a television
 * with two antennas" or "a stack of episodes", and the colour emoji that
 * come closest ignore the tint and clash with the flat white icons beside
 * them. A handful of bordered boxes costs nothing and says exactly the
 * right thing.
 */
function TvIcon() {
  return (
    <View style={styles.tvIcon}>
      <View style={styles.tvAntennaBar}>
        <View style={[styles.tvAntenna, styles.tvAntennaLeft]} />
        <View style={[styles.tvAntenna, styles.tvAntennaRight]} />
      </View>
      <View style={styles.tvScreen} />
    </View>
  );
}

/**
 * A shoulder camcorder — body, carry handle and lens. The lens is a
 * border-drawn triangle, which is the standard way to get a solid
 * non-rectangular shape in React Native without pulling in an SVG
 * renderer for one icon.
 */
function CameraIcon() {
  return (
    <View style={styles.camIcon}>
      <View style={styles.camHandle} />
      <View style={styles.camRow}>
        <View style={styles.camBody} />
        <View style={styles.camLens} />
      </View>
    </View>
  );
}

function BrowseCard({
  label,
  count,
  icon,
  color,
  delay,
  landscape,
  onPress,
}: {
  label: string;
  count: string;
  icon: ReactNode;
  color: string;
  delay: number;
  landscape: boolean;
  onPress: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(550).springify().damping(15)}
      style={styles.browseCardWrap}
    >
      <BouncePressable style={[styles.browseCard, { backgroundColor: color }]} onPress={onPress}>
        <View style={styles.browseGlow} />
        <View style={styles.browseIconWrap}>{icon}</View>
        <Text style={[styles.browseCount, !landscape && styles.browseCountPortrait]}>{count}</Text>
        <Text style={styles.browseLabel} numberOfLines={1}>
          {label}
        </Text>
      </BouncePressable>
    </Animated.View>
  );
}

function ActionCard({
  label,
  count,
  glyph,
  tint,
  landscape,
  onPress,
}: {
  label: string;
  count?: number;
  glyph: string;
  tint: string;
  landscape: boolean;
  onPress: () => void;
}) {
  return (
    <BouncePressable
      style={[styles.actionCard, landscape && styles.actionCardLandscape, { borderColor: `${tint}33` }]}
      onPress={onPress}
    >
      <View
        style={[styles.actionIconWrap, landscape && styles.actionIconWrapLandscape, { backgroundColor: `${tint}22` }]}
      >
        <Text style={[styles.actionGlyph, { color: tint }]}>{glyph}</Text>
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined && count > 0 && (
        <View style={[styles.actionBadge, { backgroundColor: tint }]}>
          <Text style={[styles.actionBadgeText, !landscape && styles.actionBadgeTextPortrait]}>{count}</Text>
        </View>
      )}
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
  header: { flexDirection: "row", alignItems: "center", marginStart: -Spacing.xl, marginTop: -Spacing.sm },
  /**
   * The negative vertical margin is against the artwork, not the layout:
   * the PNG is a 499×500 square with the mark floating in the middle, so a
   * 144pt box reserves a band of empty transparent pixels above and below
   * it. Letting the box bleed past the row's height reclaims that band —
   * the visible mark keeps its size, the dead space around it does not
   * push the rest of the screen down.
   */
  logo: { width: 144, height: 144, marginVertical: -Spacing.xl },
  brandText: { flex: 1, gap: 2, marginStart: -Spacing.xl, marginEnd: Spacing.sm },
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
  disconnectButton: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: Brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  disconnectButtonText: { color: Brand.primaryLight, fontSize: 16, fontFamily: FontFamily.bold },

  browseRow: { flexDirection: "row", gap: Spacing.md },
  browseCardWrap: { flex: 1 },
  browseCard: {
    height: 128,
    borderRadius: Radii.lg,
    overflow: "hidden",
    padding: Spacing.md,
    justifyContent: "flex-end",
    gap: 2,
  },
  browseGlow: {
    position: "absolute",
    top: -34,
    end: -22,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  browseIconWrap: {
    position: "absolute",
    top: Spacing.md,
    start: Spacing.md,
    width: 38,
    height: 38,
    borderRadius: Radii.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  browseGlyph: { color: "#fff", fontSize: 18 },

  tvIcon: { alignItems: "center" },
  tvAntennaBar: { width: 22, height: 6 },
  tvAntenna: {
    position: "absolute",
    bottom: -1,
    width: 1.5,
    height: 10,
    borderRadius: 1,
    backgroundColor: "#fff",
  },
  tvAntennaLeft: { start: 6, transform: [{ rotate: "-33deg" }] },
  tvAntennaRight: { end: 6, transform: [{ rotate: "33deg" }] },
  tvScreen: { width: 20, height: 13.5, borderRadius: 3, borderWidth: 1.5, borderColor: "#fff" },

  camIcon: { alignItems: "flex-start" },
  camHandle: {
    width: 9,
    height: 2.5,
    borderTopStartRadius: 1.5,
    borderTopEndRadius: 1.5,
    backgroundColor: "#fff",
    marginStart: 3,
    marginBottom: 1,
  },
  camRow: { flexDirection: "row", alignItems: "center" },
  camBody: { width: 16, height: 13, borderRadius: 3, borderWidth: 1.6, borderColor: "#fff" },
  /**
   * A right-pointing triangle built from borders: zero-size box, a solid
   * start border for the body of the shape and transparent top/bottom
   * borders for its slopes.
   */
  camLens: {
    width: 0,
    height: 0,
    marginStart: 1.5,
    borderTopWidth: 4.5,
    borderBottomWidth: 4.5,
    borderStartWidth: 7,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderStartColor: "#fff",
    borderEndWidth: 0,
  },
  browseCount: { color: "#fff", fontSize: 21, fontFamily: FontFamily.extraBold },
  /**
   * Portrait only. Landscape already has narrower cards and shorter rows,
   * so the same figure carries the card there rather than crowding it.
   */
  browseCountPortrait: { fontSize: 19 },
  browseLabel: { color: "rgba(255,255,255,0.92)", fontSize: 12, fontFamily: FontFamily.medium },

  /**
   * An explicit percentage width per card, not `flexBasis` + `flexGrow`
   * (which only wraps to a given count incidentally, depending on how much
   * space is left after rounding): two per row in portrait, all four on one
   * row in landscape, where the screen is twice as wide and half as tall
   * and a 2×2 block of tall cards ate most of the viewport.
   */
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  /**
   * Sized down by roughly a quarter, and most of what went was the empty
   * frame rather than the content: the vertical padding was `xl` on both
   * sides, which put more dead space in the card than icon and label
   * together.
   */
  actionCard: {
    width: "48%",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    aspectRatio: 1.7,
  },
  /** Four across, and shorter: landscape has height to spare nowhere. */
  actionCardLandscape: { width: "23%", paddingVertical: Spacing.md, gap: Spacing.xs, aspectRatio: 1.6 },
  /**
   * The card shrank; the symbol did not — it grew. What the smaller card
   * reclaimed was the empty frame around the icon, not the icon itself,
   * which is the part that has to be readable at a glance.
   */
  actionIconWrap: { width: 52, height: 52, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center" },
  actionIconWrapLandscape: { width: 44, height: 44, borderRadius: Radii.md },
  actionGlyph: { fontSize: 25, fontFamily: FontFamily.bold },
  actionLabel: { color: C.text, fontSize: 12, fontFamily: FontFamily.semiBold },
  actionBadge: {
    position: "absolute",
    top: Spacing.sm,
    end: Spacing.sm,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBadgeText: { fontSize: 11, fontFamily: FontFamily.bold, color: "#fff" },
  actionBadgeTextPortrait: { fontSize: 10 },

  emptyCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.xxl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyGlyph: { color: C.fillMedium, fontSize: 40 },
  emptyCardText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular },

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
  featuredFallbackText: {
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

  cardTitle: { color: C.text, fontSize: 12, fontFamily: FontFamily.medium, marginTop: Spacing.xs },
  cardSubtitle: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },
  })
);
