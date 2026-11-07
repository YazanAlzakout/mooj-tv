import { StyleSheet, View } from "react-native";

/**
 * The shade that lets a title be read over artwork.
 *
 * ## Why it is eight views and not one
 *
 * The first version was a single translucent band across the bottom
 * 46% of the card. On screen that is a straight horizontal line drawn
 * across every poster — through faces, through titles printed on the
 * artwork itself — and it reads as a rendering fault rather than as a
 * treatment. It was visible in every screenshot taken of it.
 *
 * A gradient is the right answer and `expo-linear-gradient` is a native
 * module this project does not carry. Eight stacked bands get there
 * instead, and they ramp by themselves: each is the same low alpha, and
 * because they overlap, the shade compounds towards the bottom —
 * `1 - (1 - a)^n` at n overlapping layers. One value to tune, and no step
 * large enough to find at this size.
 *
 * ## Why it reaches so far up
 *
 * To 62% of the height, which is more than a single line of text needs.
 * Titles wrap: a two-line name on a poster whose shade stopped at 40%
 * had its first line sitting on bare artwork, which is the case that was
 * actually unreadable. The shade has to cover the tallest title the card
 * can produce, not the usual one.
 */

/** Heights as a share of the parent, tallest first so they overlap downwards. */
const BANDS = [0.62, 0.54, 0.46, 0.39, 0.32, 0.25, 0.18, 0.11];

/** Per-band alpha. Eight of these compound to roughly 0.77 at the very bottom. */
const BAND_COLOR = "rgba(5,10,20,0.17)";

export function ArtScrim() {
  return (
    <>
      {BANDS.map((h) => (
        <View
          key={h}
          pointerEvents="none"
          style={[styles.band, { height: `${h * 100}%` }]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BAND_COLOR,
  },
});
