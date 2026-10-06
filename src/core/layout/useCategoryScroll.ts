import { useCallback, useEffect, useRef } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/**
 * Where the viewer was in each category, kept per category (2026-10-06).
 *
 * Browsing is not one position, it is one per category: leave a category
 * half way down, look at another, come back, and half way down is where you
 * belong. Before this the list simply started again, which is the complaint
 * that produced it.
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
 * ## Three ways a list needs putting back, not one
 *
 * This is where the first version was wrong, in two separate places, and
 * both are worth naming because they look like they cannot happen:
 *
 *   - **the category changes.** One list stays alive and is handed new data.
 *     The effect below does it. A category with no remembered position has
 *     to be scrolled to the top *explicitly* — leaving it alone does not
 *     leave it at the top, it leaves it wherever the previous category was,
 *     which is the original complaint wearing a different hat.
 *
 *   - **the list is replaced.** Turning the phone unmounts the split player
 *     layout, so the list that comes back is a new one starting at zero.
 *     Nothing about the category changed, so no effect fires; only the `ref`
 *     callback knows, which is why `listRef` is a function. Without that the
 *     hook goes on believing this category is already restored and the
 *     rotation — the case it was written for — quietly does nothing.
 *
 *   - **the content arrives late.** Scrolling to row four hundred of a list
 *     that has not been given its data yet is discarded in silence. So the
 *     attempt is only *recorded* once there is content to scroll into, and
 *     `onContentSizeChange` finishes the job the moment there is. Both paths
 *     run through `restoredFor`, so whichever gets there first does the
 *     work and the other does nothing.
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
 * while the content is out of sight, so an animation would be both invisible
 * and a frame budget spent on nothing.
 */
export interface CategoryScrollProps {
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (width: number, height: number) => void;
}

export function useCategoryScroll<T>(categoryId: string, defaultOffset?: (id: string) => number) {
  const list = useRef<FlatList<T> | null>(null);
  const offsets = useRef(new Map<string, number>());
  /*
    Read by the callbacks, which must record against the category that was on
    screen when the finger moved — not whichever one a later render reached.
  */
  const currentId = useRef(categoryId);
  /** The category the current list has already been put back to, if any. */
  const restoredFor = useRef<string | null>(null);
  /** Nought until the list has measured content; see the third case above. */
  const contentHeight = useRef(0);
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
    const target = list.current;
    if (!target) return;
    const offset = offsets.current.get(id) ?? defaultOffsetRef.current?.(id) ?? 0;

    /*
      Back to the top is both always possible and always necessary, so it is
      done before the content check and without consulting it: there is
      nothing to measure, and skipping it is what left a fresh category
      showing the middle of the one before it.
    */
    if (offset <= 0) {
      restoredFor.current = id;
      target.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    /* Nothing to scroll into yet — leave it unrestored and let the content tell us. */
    if (contentHeight.current <= 0) return;
    restoredFor.current = id;
    target.scrollToOffset({ offset, animated: false });
  }, []);

  /**
   * Handed to the list as its `ref`, as a function rather than a ref object.
   *
   * The *identity* of the list is the thing worth knowing: see the second
   * case above. A new list has measured nothing and been put back nowhere,
   * and both of those have to be forgotten here or the rotation never
   * restores.
   */
  const listRef = useCallback((instance: FlatList<T> | null) => {
    if (instance === list.current) return;
    list.current = instance;
    contentHeight.current = 0;
    restoredFor.current = null;
  }, []);

  useEffect(() => {
    currentId.current = categoryId;
    restoredFor.current = null;
    restore();
  }, [categoryId, restore]);

  const remember = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const id = currentId.current;
    /*
      Not settled into this category yet, so this scroll belongs to the one
      on its way out — a fling that was still running when the drag began.
      Recording it here would file someone else's position under this
      category and move the viewer the next time they come back to it.
    */
    if (restoredFor.current !== id) return;
    offsets.current.set(id, event.nativeEvent.contentOffset.y);
  }, []);

  const measured = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      restore();
    },
    [restore]
  );

  /** Spread onto the `FlatList`, beside its own props. */
  const scrollProps: CategoryScrollProps = {
    onMomentumScrollEnd: remember,
    onScrollEndDrag: remember,
    onContentSizeChange: measured,
  };

  return { listRef, scrollProps };
}
