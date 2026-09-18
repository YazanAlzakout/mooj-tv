import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { isTvBuild } from "@/core/platform/isTvBuild";
import { Focusable } from "@/components/Focusable";
import { CachedImage } from "@/components/CachedImage";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { MetaChip } from "@/components/MetaChip";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/Skeleton";
import { StarRating } from "@/components/StarRating";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useIsOffline } from "@/core/network/useIsOffline";
import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import type { SeriesDetails, SeriesEpisode } from "@/domain/series/types";
import { useDownloadState } from "@/domain/downloads/useDownloadState";
import { getMostRecentIncompleteEpisodeForSeries } from "@/db/repositories/watchProgressRepository";
import { getSeriesDetails } from "@/providers/xtream/seriesAdapter";
import { getActiveSession } from "@/state/activeSessionStore";
import { useLibraryToggle, type UseLibraryToggleResult } from "@/state/useLibraryToggle";
import type { XtreamProviderConfig } from "@/domain/provider/types";

function firstPlayableEpisode(details: SeriesDetails): SeriesEpisode | null {
  return details.seasons[0]?.episodes[0] ?? null;
}

/**
 * "Series Play" (master prompt §22) predictable rule: resume the most
 * recently-watched unfinished episode (tracked in `watch_progress` —
 * master prompt §24.6) when one exists for this series; otherwise the
 * first episode of the first season.
 */
async function resolveSeriesPlayEpisode(details: SeriesDetails): Promise<SeriesEpisode | null> {
  const inProgress = await getMostRecentIncompleteEpisodeForSeries(details.providerItemId);
  if (inProgress) {
    for (const season of details.seasons) {
      const match = season.episodes.find((e) => e.providerItemId === inProgress.providerItemId);
      if (match) return match;
    }
  }
  return firstPlayableEpisode(details);
}

export default function SeriesDetailsScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  /* Navigation-bar clearance — see live/player/[channelId].tsx. */
  const insets = useSafeAreaInsets();
  const { seriesId } = useLocalSearchParams<{ seriesId: string }>();
  const session = getActiveSession();
  const { height } = useWindowDimensions();
  const heroHeight = Math.round(height * 0.42);

  const [details, setDetails] = useState<SeriesDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const isOffline = useIsOffline();
  const noInternetMessage = isOffline && !details ? t("common", "noInternet") : null;

  useEffect(() => {
    if (!session || !seriesId || isOffline) return;
    let cancelled = false;
    getSeriesDetails(session.config, seriesId).then(
      (result) => {
        if (cancelled) return;
        setDetails(result);
        setSelectedSeason(result.seasons[0]?.seasonNumber ?? null);
        setErrorMessage(null);
      },
      (error) => {
        if (!cancelled) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
      }
    );
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per seriesId (plus an explicit retry), and again if connectivity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, reloadToken, isOffline]);

  const currentSeason = useMemo(
    () => details?.seasons.find((s) => s.seasonNumber === selectedSeason) ?? null,
    [details, selectedSeason]
  );

  const libraryItem = details
    ? {
        contentType: "series" as const,
        providerItemId: details.providerItemId,
        title: details.name,
        imageUrl: details.posterUrl,
        categoryId: details.categoryId,
        containerExtension: null,
      }
    : null;
  const favorite = useLibraryToggle("favorite", libraryItem);
  const watchLater = useLibraryToggle("watch_later", libraryItem);

  useEffect(() => {
    if (!session) router.replace("/providers");
  }, [session]);

  if (!session) {
    return null;
  }

  function playEpisode(episode: SeriesEpisode) {
    router.push({
      pathname: "/series/player/[episodeId]",
      params: {
        episodeId: episode.providerItemId,
        containerExtension: episode.containerExtension,
        title: episode.title,
        imageUrl: episode.thumbnailUrl ?? details?.posterUrl ?? "",
        seriesId: details?.providerItemId ?? "",
        seasonNumber: String(episode.seasonNumber),
        episodeNumber: String(episode.episodeNumber),
      },
    });
  }

  async function playSeries() {
    if (!details) return;
    const episode = await resolveSeriesPlayEpisode(details);
    if (episode) playEpisode(episode);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
        <BouncePressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>‹</Text>
        </BouncePressable>

        {(noInternetMessage || errorMessage) && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{noInternetMessage ?? errorMessage}</Text>
            <BouncePressable style={styles.retryButton} onPress={() => setReloadToken((n) => n + 1)}>
              <Text style={styles.retryButtonText}>{t("common", "retry")}</Text>
            </BouncePressable>
          </View>
        )}

        {!details && !errorMessage && !noInternetMessage && (
          <ScrollView contentContainerStyle={styles.skeletonWrap} showsVerticalScrollIndicator={false}>
            <Skeleton width="100%" height={heroHeight} borderRadius={0} />
            <View style={styles.skeletonBody}>
              <Skeleton width="65%" height={26} borderRadius={7} />
              <Skeleton width="45%" height={14} borderRadius={5} />
              <Skeleton width="100%" height={48} borderRadius={Radii.md} />
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} width="100%" height={78} borderRadius={Radii.md} />
              ))}
            </View>
          </ScrollView>
        )}

        {details && (
          <FlatList
            data={currentSeason?.episodes ?? []}
            keyExtractor={(item) => item.providerItemId}
            ListHeaderComponent={
              <SeriesHeader
                details={details}
                heroHeight={heroHeight}
                selectedSeason={selectedSeason}
                onSelectSeason={setSelectedSeason}
                onPlay={playSeries}
                favorite={favorite}
                watchLater={watchLater}
              />
            }
            renderItem={({ item }) => (
              <EpisodeRow
                episode={item}
                seriesDetails={details}
                config={session.config}
                providerId={session.provider.id}
                onPress={() => playEpisode(item)}
              />
            )}
            contentContainerStyle={[styles.episodeList, { paddingBottom: Spacing.xxl + insets.bottom }]}
            initialNumToRender={8}
            windowSize={7}
            /*
              Off on the TV build. Android reassigns focus when the view
              holding it is detached, and clipping detaches exactly the
              rows a D-pad is stepping through — so the highlight jumps on
              its own mid-navigation (reported 2026-09-10 as "التنقل يقفز
              قفزات"). A phone scrolls this with a finger and never has
              focus to lose, and it still wants the clipping. See
              core/layout/listWindow.ts.
            */
            removeClippedSubviews={!isTvBuild}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

function SeriesHeader({
  details,
  heroHeight,
  selectedSeason,
  onSelectSeason,
  onPlay,
  favorite,
  watchLater,
}: {
  details: SeriesDetails;
  heroHeight: number;
  selectedSeason: number | null;
  onSelectSeason: (n: number) => void;
  onPlay: () => void;
  favorite: UseLibraryToggleResult;
  watchLater: UseLibraryToggleResult;
}) {
  const { t } = useI18n();
  const [heroFailed, setHeroFailed] = useState(false);
  const heroUri = details.backdropUrl ?? details.posterUrl;

  return (
    <View>
      <View style={[styles.heroWrap, { height: heroHeight }]}>
        {heroUri && !heroFailed ? (
          <CachedImage
            uri={heroUri}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setHeroFailed(true)}
          />
        ) : (
          <View style={styles.heroFallback}>
            <Text style={styles.heroFallbackText}>{details.name}</Text>
          </View>
        )}
              {/*
                  No scrim over the artwork.

                  Three flat rectangles used to sit here, stacked at
                  bottom: 120 / 60 / 0, standing in for a gradient the app
                  has no dependency for. Flat layers have hard edges, so
                  what they actually drew over the poster was two black
                  horizontal lines across the picture — visible in a
                  framebuffer scan on 2026-09-16 as luminance steps at the
                  exact rows where the rectangles met, and reported as
                  "الخطوط موجودة على صورة البوستر".

                  The viewer's instruction is that there are to be no black
                  gradients anywhere (see the note in the live player). The
                  artwork simply ends where the page begins; a clean edge
                  reads better than a stepped fade and costs nothing.
              */}
      </View>

      <View style={styles.body}>
        <Animated.Text entering={FadeInDown.duration(420).delay(60)} style={styles.title}>
          {details.name}
        </Animated.Text>

        {details.rating !== null && (
          <Animated.View entering={FadeInDown.duration(420).delay(110)} style={styles.ratingRow}>
            <StarRating rating={details.rating} />
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(420).delay(160)} style={styles.chipRow}>
          {details.year && <MetaChip glyph="▤" label={details.year} />}
          {details.genre && <MetaChip label={details.genre} />}
          {details.seasons.length > 0 && (
            <MetaChip
              glyph="❏"
              tint="#EC4899"
              label={`${details.seasons.length} ${t("seriesDetails", "seasonsSuffix")}`}
            />
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(220)} style={styles.primaryActionRow}>
          <BouncePressable style={styles.playButton} onPress={onPlay}>
            <Text style={styles.playButtonText}>▶  {t("seriesDetails", "play")}</Text>
          </BouncePressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(280)} style={styles.secondaryActionsRow}>
          <BouncePressable style={styles.secondaryButton} onPress={favorite.toggle}>
            <Text style={[styles.secondaryButtonText, favorite.isSaved && styles.secondaryButtonTextActive]}>
              {favorite.isSaved ? `★ ${t("seriesDetails", "favorited")}` : `☆ ${t("seriesDetails", "favorite")}`}
            </Text>
          </BouncePressable>
          <BouncePressable style={styles.secondaryButton} onPress={watchLater.toggle}>
            <Text style={[styles.secondaryButtonText, watchLater.isSaved && styles.secondaryButtonTextActive]}>
              {watchLater.isSaved
                ? `✓ ${t("seriesDetails", "inWatchLater")}`
                : `+ ${t("seriesDetails", "addWatchLater")}`}
            </Text>
          </BouncePressable>
        </Animated.View>

        {details.plot && (
          <Animated.View entering={FadeIn.duration(400).delay(340)} style={styles.section}>
            <SectionHeader title={t("seriesDetails", "plot")} />
            <Text style={styles.sectionText}>{details.plot}</Text>
          </Animated.View>
        )}

        {(details.cast || details.director) && (
          <Animated.View entering={FadeIn.duration(400).delay(380)} style={styles.section}>
            <SectionHeader title={t("seriesDetails", "cast")} />
            <View style={styles.infoCard}>
              {details.director && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("seriesDetails", "director")}</Text>
                  <Text style={styles.infoValue}>{details.director}</Text>
                </View>
              )}
              {details.cast && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("seriesDetails", "cast")}</Text>
                  <Text style={styles.infoValue}>{details.cast}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {details.seasons.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={t("seriesDetails", "episodesTitle")}
              action={{
                label: `${
                  details.seasons.find((s) => s.seasonNumber === selectedSeason)?.episodes.length ?? 0
                } ${t("seriesDetails", "episodesSuffix")}`,
                onPress: () => {},
              }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.seasonPillRow}
            >
              {details.seasons.map((season) => {
                const active = selectedSeason === season.seasonNumber;
                return (
                  <BouncePressable
                    key={season.seasonNumber}
                    onPress={() => onSelectSeason(season.seasonNumber)}
                    style={[styles.seasonPill, active && styles.seasonPillActive]}
                  >
                    <Text style={[styles.seasonPillText, active && styles.seasonPillTextActive]}>{season.name}</Text>
                    <View style={[styles.seasonCountBadge, active && styles.seasonCountBadgeActive]}>
                      <Text style={[styles.seasonCountText, active && styles.seasonCountTextActive]}>
                        {season.episodes.length}
                      </Text>
                    </View>
                  </BouncePressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {details.seasons.length === 0 && (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t("seriesDetails", "noEpisodesAvailable")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * No per-row `entering` animation and a plain `Pressable`: some series on
 * this provider run to 200+ episodes, and FlatList recycles rows during
 * scroll, so a per-row entrance would re-fire constantly. The header above
 * animates instead, which is a fixed, one-off cost.
 */
function EpisodeRow({
  episode,
  seriesDetails,
  config,
  providerId,
  onPress,
}: {
  episode: SeriesEpisode;
  seriesDetails: SeriesDetails;
  config: XtreamProviderConfig;
  providerId: string;
  onPress: () => void;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);

  const download = useDownloadState({
    contentType: "episode",
    providerItemId: episode.providerItemId,
    providerId,
    title: `${seriesDetails.name} — ${episode.title}`,
    subtitle: `S${episode.seasonNumber} E${episode.episodeNumber}`,
    imageUrl: episode.thumbnailUrl ?? seriesDetails.posterUrl,
    containerExtension: episode.containerExtension,
    seriesId: seriesDetails.providerItemId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  });

  const bytesDownloaded = download.progress?.bytesDownloaded ?? download.record?.bytesDownloaded ?? 0;
  const bytesTotal = download.progress?.bytesTotal ?? download.record?.bytesTotal ?? null;
  const fraction = bytesTotal && bytesTotal > 0 ? Math.min(1, bytesDownloaded / bytesTotal) : 0;

  return (
    <View style={styles.episodeWrap}>
      <View style={styles.episodeShell}>
        <Focusable style={styles.episodeRow} onPress={onPress}>
          <View style={styles.episodeNumberBadge}>
            <Text style={styles.episodeNumberText}>{episode.episodeNumber}</Text>
          </View>

          <View style={styles.episodeThumbWrap}>
            {episode.thumbnailUrl && !thumbFailed ? (
              <CachedImage
                uri={episode.thumbnailUrl}
                style={styles.episodeThumb}
                resizeMode="cover"
                onError={() => setThumbFailed(true)}
              />
            ) : (
              <View style={styles.episodeThumbFallback} />
            )}
            <View style={styles.episodePlayOverlay}>
              <Text style={styles.episodePlayGlyph}>▶</Text>
            </View>
          </View>

          <View style={styles.episodeInfo}>
            <Text style={styles.episodeTitle} numberOfLines={1}>
              {episode.title}
            </Text>
            {episode.plot && (
              <Text style={styles.episodePlot} numberOfLines={2}>
                {episode.plot}
              </Text>
            )}
            {episode.durationLabel && <Text style={styles.episodeDuration}>◷ {episode.durationLabel}</Text>}
          </View>
        </Focusable>

        {download.eligible && (
          <Focusable
            onPress={
              download.record?.status === "downloading"
                ? download.pause
                : download.record?.status === "paused"
                  ? download.resume
                  : download.trigger
            }
            style={styles.episodeDownloadButton}
            disabled={download.record?.status === "completed"}
          >
            <Text
              style={[
                styles.episodeDownloadText,
                download.record?.status === "completed" && styles.episodeDownloadTextDone,
              ]}
            >
              {download.record?.status === "completed"
                ? "✓"
                : download.record?.status === "downloading"
                  ? "❙❙"
                  : download.record?.status === "paused"
                    ? "▶"
                    : "⬇"}
            </Text>
          </Focusable>
        )}

        {download.record && (
          <Focusable
            onPress={download.record.status === "completed" ? download.remove : download.cancel}
            style={styles.episodeDownloadButton}
            hitSlop={4}
          >
            <Text style={styles.episodeDownloadTextDanger}>✕</Text>
          </Focusable>
        )}
      </View>

      {(download.record?.status === "downloading" || download.record?.status === "paused") && (
        <View style={styles.episodeProgressTrack}>
          <View style={[styles.episodeProgressFill, { width: `${fraction * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", gap: Spacing.md, padding: Spacing.xl },
  errorText: { color: C.error, fontSize: 14, fontFamily: FontFamily.medium, textAlign: "center" },
  emptyText: { color: C.textMuted, fontSize: 13, fontFamily: FontFamily.regular },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: C.surface,
    borderRadius: Radii.md,
  },
  retryButtonText: { color: C.text, fontFamily: FontFamily.bold },

  backButton: {
    position: "absolute",
    top: Spacing.xl,
    start: Spacing.lg,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  /* On a black bubble over the artwork, so white in both themes — `C.text`
     here rendered a near-black arrow on a near-black circle in light mode. */
  backButtonText: { color: "#FFFFFF", fontSize: 22, fontFamily: FontFamily.bold, marginTop: -3 },

  skeletonWrap: { paddingBottom: Spacing.xxl },
  skeletonBody: { padding: Spacing.lg, gap: Spacing.md },

  heroWrap: { width: "100%", backgroundColor: C.surface, position: "relative" },
  heroFallback: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  heroFallbackText: { color: C.textSecondary, fontSize: 18, fontFamily: FontFamily.bold, textAlign: "center" },

  body: { paddingHorizontal: Spacing.lg, marginTop: -Spacing.sm },
  title: { color: C.text, fontSize: 24, fontFamily: FontFamily.extraBold, lineHeight: 31 },
  ratingRow: { marginTop: Spacing.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.md },

  primaryActionRow: { marginTop: Spacing.lg },
  playButton: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  playButtonText: { color: "#fff", fontSize: 15, fontFamily: FontFamily.bold },

  secondaryActionsRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm },
  secondaryButton: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  secondaryButtonText: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.semiBold },
  secondaryButtonTextActive: { color: Brand.primaryLight },

  section: { marginTop: Spacing.lg },
  sectionText: { color: C.textSecondary, fontSize: 13, fontFamily: FontFamily.regular, lineHeight: 20 },

  infoCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  infoRow: { gap: 2 },
  infoLabel: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },
  infoValue: { color: C.text, fontSize: 13, fontFamily: FontFamily.medium, lineHeight: 19 },

  seasonPillRow: { gap: Spacing.sm, paddingVertical: Spacing.xs, paddingEnd: Spacing.lg },
  seasonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  seasonPillActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  seasonPillText: { color: C.textSecondary, fontSize: 13, fontFamily: FontFamily.semiBold },
  seasonPillTextActive: { color: "#fff", fontFamily: FontFamily.bold },
  seasonCountBadge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: C.fillMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  seasonCountBadgeActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  seasonCountText: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.bold },
  seasonCountTextActive: { color: "#fff" },

  episodeList: { paddingBottom: Spacing.xxl },
  episodeWrap: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  episodeShell: { flexDirection: "row", alignItems: "stretch", gap: Spacing.sm },
  episodeProgressTrack: {
    height: 3,
    marginTop: Spacing.xs,
    borderRadius: 2,
    backgroundColor: C.fillMedium,
    overflow: "hidden",
  },
  episodeProgressFill: { height: "100%", backgroundColor: Brand.primary },
  episodeRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.sm,
  },
  episodeNumberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeNumberText: { color: Brand.primaryLight, fontSize: 13, fontFamily: FontFamily.extraBold },
  episodeThumbWrap: {
    width: 88,
    height: 56,
    borderRadius: Radii.sm,
    overflow: "hidden",
    backgroundColor: C.surfaceElevated,
  },
  episodeThumb: { width: "100%", height: "100%" },
  episodeThumbFallback: { ...StyleSheet.absoluteFill, backgroundColor: C.surfaceElevated },
  episodePlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  episodePlayGlyph: { color: "#fff", fontSize: 13 },
  episodeInfo: { flex: 1, gap: 2, justifyContent: "center" },
  episodeTitle: { color: C.text, fontSize: 13, fontFamily: FontFamily.semiBold },
  episodePlot: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular, lineHeight: 15 },
  episodeDuration: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },

  episodeDownloadButton: {
    width: 48,
    borderRadius: Radii.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeDownloadText: { color: Brand.primaryLight, fontSize: 16 },
  episodeDownloadTextDone: { color: C.success },
  episodeDownloadTextDanger: { color: Brand.primaryLight, fontSize: 14 },
  })
);
