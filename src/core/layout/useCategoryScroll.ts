import { useCallback, useEffect, useRef } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/**
 * Where the viewer was in each category, kept per category (2026-10-06).
 *
 * Browsing is not one position, it is one per category: leave "أفلام عربية"
 * half way down, look at another category, come back, and half way down is
 * where you belong. Before this the list simply started again, which is the
 * complaint that produced it — rotating the phone or stepping through the
 * strip threw the place away.
 *
 * ## Why a position and not an item
 *
 * The first version anchored on the channel that was playing, which is right
 * the first time a category is opened and wrong every time after: the viewer
 * had scrolled somewhere for a reason, and being returned to the playing
 * channel is not being returned to where they were. `defaultOffset` keeps
 * the useful half — it is consulted only for a category with no remembered
 * position, which is exactly the first time it is seen.
 *
 * ## Two different ways a list arrives
 *
 * Restoring has to cover both, and they are not the same:
 *
 *   - the **grids** keep one list alive and hand it new data when the
 *     category changes, so the effect below puts it back;
 *   - the **split player list** is unmounted outright when the phone is
 *     turned, because the layout it belongs to is only rendered upright, and
 *     the list that comes back is a new one starting at zero.
 *
 * A fresh list cannot be scrolled before it knows how tall its content is,
 * so the second case is handled from `onContentSizeChange` — the first
 * moment the offset means anything — rather than from a timer hoping the
 * layout has happened. `restoredFor` makes the two paths idempotent: whoever
 * gets there first for a category does the work, and the other does nothing.
 *
 * ## What it costs
 *
 * One number per category in a ref, and callbacks that fire when a scroll
 * gesture *ends*. Nothing runs per frame and nothing re-renders: `onScroll`
 * would fire sixty times a second for a number that is read once, which on
 * these screens is the kind of per-frame JavaScript this project has twice
 * removed.
 *
 * The restore is never animated. It happens inside the category transition,
 * while the content is faded out, so an animation would be both invisible
 * and a frame budget spent on nothing.
 */
export interface CategoryScrollProps {
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: () => void;
}

export function useCategoryScroll<T>(categoryId: string, defaultOffset?: (id: string) => number) {
  const listRef = useRef<FlatList<T> | null>(null);
  const offsets = useRef(new Map<string, number>());
  /*
    Read by the callbacks, which must record against the category that was on
    screen when the finger moved — not whichever one a later render reached.
  */
  const currentId = useRef(categoryId);
  /** The category the current list has already been put back to, if any. */
  const restoredFor = useRef<string | null>(null);
  /*
    Held in a ref so the callbacks never change identity. The screens build
    this closure over their filtered list, so it is a new function on most
    renders, and a changing callback would re-subscribe the list for nothing.
  */
  const defaultOffsetRef = useRef(defaultOffset);
  useEffect(() => {
    defaultOffsetRef.current = defaultOffset;
  });

  const restore = useCallback(() => {
    const id = currentId.current;
    if (restoredFor.current === id) return;
    restoredFor.current = id;
    const offset = offsets.current.get(id) ?? defaultOffsetRef.current?.(id) ?? 0;
    if (offset <= 0) return;
    listRef.current?.scrollToOffset({ offset, animated: false });
  }, []);

  useEffect(() => {
    currentId.current = categoryId;
    restoredFor.current = null;
    restore();
  }, [categoryId, restore]);

  const remember = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsets.current.set(currentId.current, event.nativeEvent.contentOffset.y);
  }, []);

  /** Spread onto the `FlatList`, beside its own props. */
  const scrollProps: CategoryScrollProps = {
    onMomentumScrollEnd: remember,
    onScrollEndDrag: remember,
    onContentSizeChange: restore,
  };

  /** Call when the catalogue underneath is replaced, so no stale position survives it. */
  const forget = useCallback(() => {
    offsets.current.clear();
    restoredFor.current = null;
  }, []);

  return { listRef, scrollProps, forget };
}
