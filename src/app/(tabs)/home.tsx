import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Image, ScrollView, StyleSheet, Text, View } from "react-native";

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
  const [continueWatching, setContinueWatching] = useState<WatchProgressEntry[]>([]);
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  /*
   * The lead title and the rail are two slices of one list, memoised
   * because `data` identity is what tells a FlatList whether anything
   * changed — a fresh array every render makes it redo work for nothing.
   */
  const hero = featured.length > 0 ? featured[0] : null;
  const railItems = useMemo(() => featured.slice(1), [featured]);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const refreshContinueWatching = useCallback(() => {
    getRecentWatchProgress(10).then(setContinueWatching);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshContinueWatching();
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

  function openFeatured(item: FeaturedItem) {
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

          {railItems.length > 0 && (
            /*
             * The section arrives as one piece — header and rail together.
             * The cards inside are deliberately left alone; see the note on
             * FeaturedCard for why a recycling row must not have an
             * entrance of its own.
             */
            <Animated.View entering={FadeInDown.delay(90).duration(360)}>
              <SectionHeader title={t("home", "featured")} />
              <FlatList
        {...NO_CLIP}
                data={railItems}
                keyExtractor={(item) => `${item.contentType}-${item.providerItemId}`}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
                renderItem={({ item }) => <FeaturedCard item={item} onPress={() => openFeatured(item)} />}
              />
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(180).duration(360)}>
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
          </Animated.View>
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
function HeroCard({ item, onPress }: { item: FeaturedItem; onPress: () => void }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  return (
    <BouncePressable style={styles.hero} onPress={onPress}>
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
  disconnectButton: {
    width: 40,
    height: 40,
    borderRadius: Radii.pill,
    backgroundColor: Brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  disconnectButtonText: { color: Brand.primaryLight, fontSize: 16, fontFamily: FontFamily.bold },



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
    aspectRatio: 16 / 10,
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
  emptyCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    /* lg, not xxl: an empty state is a note, not a feature. At xxl the
       "nothing watched yet" card was the tallest thing on the screen. */
    paddingVertical: Spacing.lg,
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
