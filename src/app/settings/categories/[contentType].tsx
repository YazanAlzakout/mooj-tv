import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useI18n } from "@/core/i18n/I18nContext";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import {
  getHiddenCategoryIds,
  setCategoryHidden,
  type CategoryContentType,
} from "@/db/repositories/categoryVisibilityRepository";
import { getLiveCategories } from "@/providers/xtream/xtreamAdapter";
import { getVodCategories } from "@/providers/xtream/vodAdapter";
import { getSeriesCategories } from "@/providers/xtream/seriesAdapter";
import { getActiveSession } from "@/state/activeSessionStore";

interface CategoryRow {
  id: string;
  name: string;
}

const TITLE_NAMESPACE: Record<CategoryContentType, "liveCategories" | "moviesCategories" | "seriesCategories"> = {
  live: "liveCategories",
  movie: "moviesCategories",
  series: "seriesCategories",
};

export default function CategoryVisibilityScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const { contentType } = useLocalSearchParams<{ contentType: CategoryContentType }>();
  const session = getActiveSession();

  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  /**
   * Clear a previous error the moment a new attempt starts (contentType
   * changed, or the user tapped Retry) — done during render, React's
   * documented pattern for "adjusting state when a prop changes", rather
   * than as the first line of the fetch effect below, which this project's
   * `react-hooks/set-state-in-effect` lint rule flags.
   */
  const attemptKey = `${contentType}:${reloadToken}`;
  const [lastAttemptKey, setLastAttemptKey] = useState(attemptKey);
  if (attemptKey !== lastAttemptKey) {
    setLastAttemptKey(attemptKey);
    setErrorMessage(null);
  }

  useEffect(() => {
    if (!session || !contentType) return;
    let cancelled = false;
    const fetcher =
      contentType === "live" ? getLiveCategories : contentType === "movie" ? getVodCategories : getSeriesCategories;
    fetcher(session.config).then(
      (result) => {
        if (!cancelled) setCategories(result);
      },
      (error) => {
        if (!cancelled) setErrorMessage(toUserFacingMessage(error, t("common", "providerUnreachable")));
      }
    );
    getHiddenCategoryIds(contentType).then((result) => {
      if (!cancelled) setHidden(result);
    });
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per contentType (plus an explicit retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, reloadToken]);

  if (!session || !contentType) {
    return null;
  }

  async function toggle(categoryId: string) {
    const isHidden = hidden.has(categoryId);
    await setCategoryHidden(contentType, categoryId, !isHidden);
    setHidden((prev) => {
      const next = new Set(prev);
      if (isHidden) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const filtered = (categories ?? []).filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title={t(TITLE_NAMESPACE[contentType], "title")}
        subtitle={categories ? `${categories.length}` : undefined}
      />

      <TextInput
        style={styles.search}
        placeholder={t("categoryVisibility", "searchPlaceholder")}
        placeholderTextColor={themeColors().textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={search}
        onChangeText={setSearch}
      />

      {errorMessage && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <BouncePressable style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>{t("common", "retry")}</Text>
          </BouncePressable>
        </View>
      )}

      {errorMessage ? null : categories === null ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      ) : (
        <FlatList
        {...NO_CLIP}
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowText} numberOfLines={1}>
                {item.name}
              </Text>
              <Switch value={!hidden.has(item.id)} onValueChange={() => toggle(item.id)} trackColor={{ true: Brand.primary }} />
            </View>
          )}
          getItemLayout={(_, index) => ({ length: 58, offset: 58 * index, index })}
          initialNumToRender={16}
          windowSize={7}
        />
      )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md, padding: Spacing.xl },
  errorText: { color: C.error, fontSize: 14, fontFamily: FontFamily.medium, textAlign: "center" },
  retryButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: C.surface,
    borderRadius: Radii.md,
  },
  retryButtonText: { color: C.text, fontFamily: FontFamily.bold },

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

  list: { padding: Spacing.lg, gap: Spacing.sm },
  row: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  rowText: { flex: 1, color: C.text, fontSize: 14, fontFamily: FontFamily.semiBold },
  })
);
