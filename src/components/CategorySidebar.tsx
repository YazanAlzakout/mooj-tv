import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text } from "react-native";

import { NO_CLIP } from "@/core/layout/listWindow";

import { Focusable } from "@/components/Focusable";
import type { CategoryTabItem } from "@/components/CategoryTabs";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";

/**
 * How long the rail waits, after the D-pad stops moving, before it actually
 * changes category.
 *
 * Selection follows focus here — moving onto a category shows it, because
 * requiring Select as well means two presses for what should be one. But
 * "shows it" is an expensive thing to do: committing a category re-filters
 * the provider's entire lineup (~11k channels on the real test account),
 * hands a brand-new array to the grid, remounts the grid's whole render
 * window with its logo loads, and writes the remembered category to
 * SQLite. Doing all of that *per arrow press* is what made the rail
 * unusable on a real television — walking down ten categories queued ten
 * full re-filters and ten database writes on the thread that draws the
 * screen, and the app stopped responding to the remote until they drained
 * (reported 2026-09-10: "التطبيق صار بطيء وحركة التنقل سيئة وبيعلق").
 *
 * So focus and commit are separated. The focus ring moves at the speed of
 * the remote, always, because it is drawn by `Focusable` from the native
 * focus event and costs one small re-render of one row. The category only
 * commits once the viewer has settled — which is the only moment they could
 * be looking at the grid anyway.
 *
 * 200ms, lowered from 350 on 2026-09-10. At 350 the row highlight also
 * waited for the commit, so a viewer moving one step saw nothing happen for
 * a third of a second and concluded the rail needed Select pressed to
 * choose a category ("يجب عند التحريك ينتقل فورا"). The highlight now moves
 * with the focus instead — see `focusedId` — so this delay only governs how
 * long the *grid* waits, and it can sit closer to a remote's repeat interval
 * without a burst of commits.
 */
const COMMIT_DELAY_MS = 200;

/**
 * The rail's full horizontal footprint: its fixed width plus the hairline
 * border on its inner edge.
 *
 * Exported because the grid beside it has to subtract this to know how wide
 * it actually is. A content grid computes its row height from the width it
 * is given and hands that to `getItemLayout`, and `getItemLayout` is a
 * promise FlatList trusts absolutely — it never measures a row itself. Left
 * reading the *window* width while the rail took 241 of it, every row was
 * declared about 13% taller than it draws, the error compounded with every
 * row scrolled, and by twenty rows down the list was placing cells more
 * than two rows away from where they belong: black bands on screen, and
 * scrolling that fights back ("بس انزل لتحت بالقنوات بتصير الشاشة سوداء").
 */
export const TV_RAIL_WIDTH = 241;

/**
 * The category list as a vertical rail, for Android TV.
 *
 * The phone's horizontal strip (`CategoryTabs`) is the wrong shape for a
 * remote: reaching a category twenty along costs twenty presses through a
 * row that also competes with the grid for Up and Down. A vertical rail sits
 * beside the content, so Left moves into it, Up/Down walks it, and Right
 * returns — the arrangement every TV interface uses for the same reason.
 *
 * Since 2026-09-10 this is the only Live TV layout on a television; the
 * three-way setting it used to be one of is gone (see migration 19).
 */
export function CategorySidebar({
  categories,
  activeId,
  onSelect,
}: {
  categories: CategoryTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  /**
   * The row the D-pad is on right now, which is what the viewer reads as
   * "selected".
   *
   * Kept apart from `activeId` — the category the grid is actually
   * showing — because the two are deliberately out of step for a moment.
   * Binding the highlight to `activeId` meant it lagged the commit, and a
   * control that does not respond to a press does not read as slow; it
   * reads as not working. Feedback is instant, work is deferred.
   *
   * Falls back to `activeId` before the rail has ever held focus, so
   * arriving on the screen still shows which category is on screen.
   */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const selectedId = focusedId ?? activeId;
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * `onSelect` is redefined every render by the screen above; keeping it in
   * a ref lets the callbacks below stay stable for the whole life of the
   * rail, so a commit never re-creates every row's handler.
   */
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    return () => {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    };
  }, []);

  /** Focus moved here: arm the commit, replacing any still pending. */
  const scheduleCommit = useCallback((id: string) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onSelectRef.current(id);
    }, COMMIT_DELAY_MS);
  }, []);

  /** Select pressed: the viewer has asked outright, so don't make them wait. */
  const commitNow = useCallback((id: string) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    onSelectRef.current(id);
  }, []);

  /*
   * The rail deliberately does **not** claim the initial focus.
   *
   * Two things asking for it is worse than either: the grid beside this
   * also sets `hasTVPreferredFocus` on its first cell, and
   * `hasTVPreferredFocus` is not a description of state — react-native-tvos
   * calls `requestFocus()` whenever the prop is set. Categories load
   * asynchronously and the remembered category is applied later still, so
   * the active row changed identity after mount and a *different* row then
   * requested focus, pulling it out of wherever the viewer had moved it.
   * That is the focus jumping reported from the television on 2026-09-10.
   *
   * The grid keeps the claim, so the remote lands on content and Left
   * reaches the rail. Landing on the rail instead would be worse anyway:
   * selection follows focus here, so the first Down would change category
   * before the viewer had asked for anything.
   */

  return (
    <FlatList
        {...NO_CLIP}
      data={categories}
      keyExtractor={(item) => item.id}
      style={styles.rail}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <Focusable
          style={[styles.row, selectedId === item.id && styles.rowActive]}
          onFocus={() => {
            setFocusedId(item.id);
            scheduleCommit(item.id);
          }}
          onPress={() => {
            setFocusedId(item.id);
            commitNow(item.id);
          }}
        >
          <Text
            style={[styles.label, selectedId === item.id && styles.labelActive]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
        </Focusable>
      )}
    />
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    /**
     * A fixed width rather than a fraction: category names vary wildly in
     * length and a rail that resized with them would shift the grid beside
     * it every time the list scrolled.
     */
    /** 240 + the 1pt border = `TV_RAIL_WIDTH`; keep the two in step. */
    rail: { width: 240, borderEndWidth: 1, borderEndColor: C.border },
    list: { padding: Spacing.sm, gap: Spacing.xs },
    /** `minHeight`, never fixed — a mixed Arabic/Latin name measures taller. */
    row: {
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radii.md,
      backgroundColor: C.fillSubtle,
    },
    rowActive: { backgroundColor: Brand.primary },
    label: {
      color: C.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: FontFamily.semiBold,
      ...AndroidTextFix,
    },
    labelActive: { color: C.onAccent, fontFamily: FontFamily.bold },
  })
);
