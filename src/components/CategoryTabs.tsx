import { useCallback, useEffect, useRef } from "react";
import { FlatList, StyleSheet, Text } from "react-native";

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
 */
export function CategoryTabs({
  categories,
  activeId,
  alwaysDark = false,
  onSelect,
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
}) {
  const listRef = useRef<FlatList<CategoryTabItem> | null>(null);
  /** The index a refused scroll has already been retried for, so it cannot loop. */
  const retried = useRef<number | null>(null);
  const activeIndex = categories.findIndex((category) => category.id === activeId);

  const bring = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }, []);

  /*
    **The chosen chip is always in view.**

    Until the sideways drag existed, the only way to change category was
    to tap a chip — necessarily one already on screen — so the strip never
    had to move and nothing here scrolled it. A drag can choose a chip
    that is off the end, and then the only sign anything had happened was
    the content changing under the finger, with the strip above still
    showing the old category filled in. Centring the chosen chip is what
    joins the gesture to the strip.

    `viewPosition: 0.5` and the list's own cell measurements do the
    arithmetic, deliberately rather than this file: the chips are
    content-width and Arabic forces a right-to-left layout, so geometry
    of my own would be two more things to keep in step with the styles
    instead of none.
  */
  useEffect(() => {
    if (activeIndex < 0) return;
    retried.current = null;
    bring(activeIndex);
  }, [activeIndex, bring]);

  return (
    <FlatList
        {...NO_CLIP}
      ref={listRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScrollToIndexFailed={(info) => {
        /*
          A chip far enough along not to be mounted has no measured frame,
          so the list refuses rather than guess. Go to where it is
          estimated to be, which mounts it, then ask once more — once
          only, or a chip that never measures would retry for ever.
        */
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: true,
        });
        if (retried.current === info.index) return;
        retried.current = info.index;
        setTimeout(() => bring(info.index), 80);
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
