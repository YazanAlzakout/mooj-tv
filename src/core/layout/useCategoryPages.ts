import { useCallback, useEffect, useRef } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/**
 * Where the viewer was in each category, for a screen that renders several
 * lists at once (2026-10-07).
 *
 * `useCategoryScroll` keeps one list and swaps its data. `CategoryPager`
 * keeps three lists side by side, so the memory has to be keyed per category
 * rather than held per list — and it has to survive a page being unmounted,
 * which is what happens the moment the viewer moves two categories away and
 * the window no longer reaches back.
 *
 * ## No hook per page
 *
 * The obvious shape — call a hook inside each page — cannot be written: the
 * number of pages changes with the position in the strip, and a hook called
 * in a loop is a hook order that changes between renders. So this is one hook
 * for the screen, handing out a set of callbacks per category id.
 *
 * Those callback sets are **cached per id and handed back identical every
 * time**, and that is load-bearing rather than tidy. A fresh `ref` function
 * on each render is a different ref to React: it calls the old one with null
 * and the new one with the list, which looks exactly like an unmount and a
 * remount. This hook restores the scroll position when a list arrives, so a
 * new ref every render would drag the viewer back to their old position on
 * every single render.
 *
 * ## Shape
 *
 * As in `useCategoryScroll`, a remembered offset only means anything for the
 * layout that produced it, so a change of `shape` — the column count, the
 * search term — forgets every position rather than replaying pixels into a
 * grid they were never measured in.
 */

export interface CategoryPageScroll {
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (width: number, height: number) => void;
}

export interface CategoryPage<T> {
  listRef: (instance: FlatList<T> | null) => void;
  scroll: CategoryPageScroll;
}

export function useCategoryPages<T>(shape?: string | number) {
  const offsets = useRef(new Map<string, number>());
  const lists = useRef(new Map<string, FlatList<T> | null>());
  const heights = useRef(new Map<string, number>());
  /** Categories whose currently mounted list has already been put back. */
  const restored = useRef(new Set<string>());
  const cache = useRef(new Map<string, CategoryPage<T>>());

  const shapeRef = useRef(shape);
  useEffect(() => {
    if (shapeRef.current === shape) return;
    shapeRef.current = shape;
    offsets.current.clear();
    restored.current.clear();
  }, [shape]);

  const restore = useCallback((id: string) => {
    if (restored.current.has(id)) return;
    const list = lists.current.get(id);
    if (!list) return;
    const offset = offsets.current.get(id) ?? 0;

    /*
      Back to the top is always possible and always necessary — a page with
      nothing remembered must start at its first row, not wherever the list
      it replaced happened to be.
    */
    if (offset <= 0) {
      restored.current.add(id);
      list.scrollToOffset({ offset: 0, animated: false });
      return;
    }

    /* Nothing to scroll into yet; `onContentSizeChange` will come back here. */
    if ((heights.current.get(id) ?? 0) <= 0) return;
    restored.current.add(id);
    list.scrollToOffset({ offset, animated: false });
  }, []);

  const remember = useCallback((id: string, event: NativeSyntheticEvent<NativeScrollEvent>) => {
    /*
      Not settled yet, so this belongs to a list on its way out rather than to
      this category. Recording it would move the viewer next time they return.
    */
    if (!restored.current.has(id)) return;
    offsets.current.set(id, event.nativeEvent.contentOffset.y);
  }, []);

  /** The callbacks for one category's list. Identical object every time — see above. */
  return useCallback(
    (id: string): CategoryPage<T> => {
      const known = cache.current.get(id);
      if (known) return known;

      const made: CategoryPage<T> = {
        listRef: (instance) => {
          if (lists.current.get(id) === instance) return;
          lists.current.set(id, instance);
          /* A new list has measured nothing and been put back nowhere. */
          heights.current.set(id, 0);
          restored.current.delete(id);
          if (instance) restore(id);
        },
        scroll: {
          onMomentumScrollEnd: (event) => remember(id, event),
          onScrollEndDrag: (event) => remember(id, event),
          onContentSizeChange: (_width, height) => {
            heights.current.set(id, height);
            restore(id);
          },
        },
      };

      cache.current.set(id, made);
      return made;
    },
    [restore, remember]
  );
}
