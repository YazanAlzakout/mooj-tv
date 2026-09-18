import { useWindowDimensions } from "react-native";

/** Every content grid packs this many cells per row once the phone is on its side. */
const LANDSCAPE_COLUMNS = 4;

/**
 * How many cells a content grid should show per row right now.
 *
 * Portrait keeps each section's own density (channels read fine two-up,
 * posters three-up), but landscape is a different shape entirely: the
 * screen roughly doubles in width and halves in height, so a portrait
 * column count leaves cells far too large — a poster ends up taller than
 * the viewport. Four across is the count that keeps a row scannable
 * without shrinking artwork past recognition.
 *
 * `useWindowDimensions` re-renders on rotation, so callers update on their
 * own; nothing here needs an orientation listener.
 *
 * Note for callers: React Native cannot change `numColumns` on a live
 * `FlatList`. Pass the returned value as the list's `key` as well, so a
 * rotation remounts the list instead of throwing.
 */
export function useGridColumns(portraitColumns: number): number {
  const { width, height } = useWindowDimensions();
  return width > height ? LANDSCAPE_COLUMNS : portraitColumns;
}
