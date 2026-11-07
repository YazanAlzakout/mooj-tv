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

/**
 * Each band as [height, alpha], tallest and faintest first.
 *
 * The alphas rise rather than repeating, and that is the whole trick. With
 * one value for all eight, the topmost edge carried the full step — on a
 * bright still that edge was a visible line drawn across the picture, which
 * is the fault the single band had, only eight times smaller. Starting at
 * 0.05 puts the first edge below what the eye can find, and every edge
 * after it lands on ground already darkened, where the same delta reads as
 * less. They compound to about 0.70 at the foot, which is what a white
 * title needs.
 */
const BANDS: [number, number][] = [
  [0.62, 0.05],
  [0.54, 0.06],
  [0.46, 0.08],
  [0.39, 0.1],
  [0.32, 0.13],
  [0.25, 0.17],
  [0.18, 0.22],
  [0.11, 0.28],
];

export function ArtScrim() {
  return (
    <>
      {BANDS.map(([h, a]) => (
        <View
          key={h}
          pointerEvents="none"
          style={[
            styles.band,
            { height: `${h * 100}%`, backgroundColor: `rgba(5,10,20,${a})` },
          ]}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  band: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
