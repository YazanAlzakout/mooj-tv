import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { CategoryRail } from "@/components/CategoryRail";
import { CategorySidebar } from "@/components/CategorySidebar";
import type { CategoryTabItem } from "@/components/CategoryTabs";
import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * One shape for browsing: the category rail down one side, the content grid
 * beside it.
 *
 * Live TV, Movies and Series are the same task — pick a category, pick a
 * thing in it — and each screen used to answer it differently. The
 * television was unified first (requested 2026-09-10: "يجب توحيد طريقة
 * العرض لكل القنوات والمسلسلات والافلام"); the phone kept a horizontal
 * strip above the grid, where four categories fit and the rest were a
 * sideways scroll nobody discovers.
 *
 * Both platforms now read the same way, each with the rail it needs:
 *
 * - **Television:** `CategorySidebar` on the left, 241dp, selection
 *   following D-pad focus on a delay. Left enters it, Up/Down walks it,
 *   Right returns.
 * - **Phone:** `CategoryRail` on the right, 84dp, tap to choose. A sideways
 *   swipe on the grid still changes category, and the rail follows.
 *
 * ## Why the sides differ
 *
 * A television rail sits on the left because Left is how you reach it. A
 * phone rail sits on the right because that is where the thumb already is,
 * and because the artwork should start at the edge the eye starts from.
 *
 * ## The wrapper is not optional and not free
 *
 * An earlier version wrapped both platforms in a `View` that had no style
 * at all on the phone. That took away the `flex: 1` parent the grid's
 * FlatList needs, and left it filling the screen only by accident of
 * content measurement. Both branches below carry `flex: 1` explicitly for
 * that reason — a wrapper without it is the bug, not the wrapper itself.
 *
 * ## The grid must know this is here
 *
 * Whichever rail renders, it takes width the grid does not get. A grid
 * works its column width out from the width it is handed and gives the
 * resulting row height to `getItemLayout`, which FlatList trusts without
 * ever measuring a row. Forget to subtract the rail and every row is
 * declared taller than it draws, the error compounds down the list, and
 * cells are placed rows away from where they appear. See `TV_RAIL_WIDTH`
 * for the first time that happened, in full.
 *
 * The rail is hidden when there is nothing to choose between — one
 * category, or none loaded yet — so no screen shows an empty column.
 */
export function BrowseLayout({
  categories,
  activeId,
  onSelect,
  children,
}: {
  /** Null while still loading — the rail simply does not appear yet. */
  categories: CategoryTabItem[] | null;
  activeId: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const hasRail = Boolean(categories && categories.length > 1);

  if (isTvBuild) {
    return (
      <View style={styles.body}>
        {hasRail && categories && (
          <CategorySidebar categories={categories} activeId={activeId} onSelect={onSelect} />
        )}
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      {/* Content first, rail second: inside a `row` this puts the rail on the right. */}
      <View style={styles.content}>{children}</View>
      {hasRail && categories && (
        <CategoryRail categories={categories} activeId={activeId} onSelect={onSelect} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: "row" },
  content: { flex: 1 },
});
