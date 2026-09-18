import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { CategorySidebar } from "@/components/CategorySidebar";
import type { CategoryTabItem } from "@/components/CategoryTabs";
import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * One shape for browsing on a television: the category rail on one side,
 * the content grid beside it.
 *
 * Live TV, Movies and Series are the same task — pick a category, pick a
 * thing in it — and until now each screen answered it differently on TV:
 * Live TV had the rail, the other two still had the phone's horizontal
 * strip above a search box, which is the wrong shape for a remote (reaching
 * the twentieth category costs twenty presses through a row that also
 * competes with the grid for Up and Down, and the search box grabs the
 * on-screen keyboard the moment the D-pad passes through it). Requested
 * 2026-09-10: "يجب توحيد طريقة العرض لكل القنوات والمسلسلات والافلام".
 *
 * **On a phone this renders `children` and nothing else** — not a wrapper
 * View, a bare fragment. That is deliberate and load-bearing: an earlier
 * version of this arrangement wrapped both platforms in a `View` that had
 * no style at all on the phone, which took away the `flex: 1` parent the
 * grid's FlatList needs and left it filling the screen only by accident of
 * content measurement. The phone tree must come out byte-for-byte as it
 * was before the rail existed.
 *
 * The rail is hidden when there is nothing to choose between (one category,
 * or none loaded yet), so a screen never shows an empty 240pt column.
 */
export function TvBrowseLayout({
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
  if (!isTvBuild) return <>{children}</>;

  return (
    <View style={styles.body}>
      {categories && categories.length > 1 && (
        <CategorySidebar categories={categories} activeId={activeId} onSelect={onSelect} />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: "row" },
  content: { flex: 1 },
});
