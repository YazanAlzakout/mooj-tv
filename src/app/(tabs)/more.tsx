import { router, useFocusEffect } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/core/i18n/I18nContext";
import type { ThemeColors } from "@/core/theme/palettes";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { getDownloadsSummary } from "@/db/repositories/downloadRepository";
import { getLibraryCount } from "@/db/repositories/libraryRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";

/**
 * Everything that is not a content section.
 *
 * The app this was cloned from put these on the home screen as a grid of
 * square tiles, where they competed for the first screen with the content
 * itself. They are not a destination anybody opens the app for: they are
 * what you go looking for when you already know what you want. So they get
 * a list — scannable top to bottom, one line each, the count on the right —
 * and the home screen gets its space back.
 *
 * Counts are refreshed on focus rather than on mount. This is a tab: it
 * stays mounted while the viewer stars something three screens away, and a
 * favourites count that only ever read right on the first visit would be
 * worse than showing none at all.
 */
export default function MoreScreen() {
  useThemeRerender();
  const { t } = useI18n();

  const [favoriteCount, setFavoriteCount] = useState<number | null>(null);
  const [watchLaterCount, setWatchLaterCount] = useState<number | null>(null);
  const [downloadsCount, setDownloadsCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      getLibraryCount("favorite").then(setFavoriteCount);
      getLibraryCount("watch_later").then(setWatchLaterCount);
      if (downloadsSupported()) getDownloadsSummary().then((s) => setDownloadsCount(s.count));
    }, [])
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScreenHeader title={t("tabs", "more")}
        showBack={false} />

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <Row
            glyph="⌕"
            label={t("home", "search")}
            delay={0}
            onPress={() => router.push("/search")}
          />
          <Row
            glyph="★"
            gold
            label={t("home", "favorites")}
            delay={55}
            count={favoriteCount}
            onPress={() =>
              router.push({ pathname: "/library/[listType]", params: { listType: "favorite" } })
            }
          />
          <Row
            glyph="⏱"
            label={t("home", "watchLater")}
            delay={110}
            count={watchLaterCount}
            onPress={() =>
              router.push({ pathname: "/library/[listType]", params: { listType: "watch_later" } })
            }
          />
          {downloadsSupported() && (
            <Row
              glyph="⬇"
              label={t("home", "downloads")}
            delay={165}
              count={downloadsCount}
              onPress={() => router.push("/downloads")}
            />
          )}
          <Row
            glyph="◷"
            label={t("history", "title")}
            delay={220}
            onPress={() => router.push("/history")}
          />
          <Row
            glyph="⚙"
            label={t("home", "settings")}
            delay={275}
            onPress={() => router.push("/settings")}
          />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * One line of the list.
 *
 * `count` is deliberately three-state: `null` while the query is still in
 * flight, a number once it answers, and `undefined` for a row that has no
 * count at all. Collapsing the first two would flash a zero on every visit
 * and read as "you have no favourites" for as long as the database takes.
 */
function Row({
  glyph,
  gold,
  label,
  count,
  delay,
  onPress,
}: {
  glyph: string;
  /** Favourites only: a star the viewer placed is a different kind of thing. */
  gold?: boolean;
  label: string;
  count?: number | null;
  delay: number;
  onPress: () => void;
}): ReactNode {
  const tint = gold ? "#F6C445" : Brand.primaryLight;
  return (
    /*
     * Each row arrives a beat after the one above it. 55ms is small enough
     * that the list still reads as one object settling rather than six
     * things queueing, and the whole cascade is over in a third of a
     * second — before anyone could have decided what to tap.
     *
     * A plain timing, not a spring. The spring that was here first
     * overshot on six rows at once and the screen looked like it was
     * bouncing rather than arriving.
     */
    <Animated.View entering={FadeInDown.delay(delay).duration(300)}>
    <Focusable onPress={onPress} style={styles.row}>
      <View style={[styles.glyphWrap, { backgroundColor: tint + "22", borderColor: tint + "55" }]}>
        <Text style={[styles.glyph, { color: tint }]}>{glyph}</Text>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {typeof count === "number" && <Text style={styles.count}>{count}</Text>}
      <Text style={styles.chevron}>›</Text>
    </Focusable>
    </Animated.View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      backgroundColor: C.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.border,
    },
    glyphWrap: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    glyph: { fontSize: 18, ...AndroidTextFix },
    label: {
      flex: 1,
      color: C.text,
      fontFamily: FontFamily.medium,
      fontSize: 15,
      ...AndroidTextFix,
    },
    count: {
      color: C.textSecondary,
      fontFamily: FontFamily.semiBold,
      fontSize: 13,
      ...AndroidTextFix,
    },
    chevron: {
      color: C.textMuted,
      fontSize: 20,
      ...AndroidTextFix,
    },
  })
);
