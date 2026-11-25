import { StyleSheet, Text, View } from "react-native";

import { FontFamily, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

/**
 * Five-star display for a provider's 0–10 rating. Renders half-stars so a
 * 7.3 doesn't silently round to the same thing as a 6.6 — providers vary a
 * lot in how they score, and collapsing that detail makes every title look
 * alike. Only rendered when the provider actually reported a rating (master
 * prompt §21: never fabricate metadata).
 */
export function StarRating({ rating, showNumber = true }: { rating: number; showNumber?: boolean }) {
  const outOfFive = Math.min(5, Math.max(0, rating / 2));

  return (
    <View style={styles.row}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i + 1 <= Math.floor(outOfFive);
        const half = !filled && i < outOfFive;
        if (half) {
          /*
            Built from ★ and ☆ rather than typed. "⯨" (U+2BE8) is in no font
            iOS carries, so the first iPhone build drew it as a "?" box
            (2026-11-24). A full star clipped to half its width over an
            outline is the same picture in every font.
          */
          return (
            <View key={i}>
              <Text style={[styles.star, styles.starActive]}>☆</Text>
              <View style={styles.halfClip}>
                <Text style={[styles.star, styles.starActive]}>★</Text>
              </View>
            </View>
          );
        }
        return (
          <Text key={i} style={[styles.star, filled && styles.starActive]}>
            {filled ? "★" : "☆"}
          </Text>
        );
      })}
      {showNumber && <Text style={styles.number}>{rating.toFixed(1)}/10</Text>}
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 3 },
  star: { color: C.fillStrong, fontSize: 14 },
  starActive: { color: "#F59E0B" },
  halfClip: { position: "absolute", top: 0, bottom: 0, start: 0, width: "50%", overflow: "hidden" },
  number: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.bold, marginStart: Spacing.xs },
  })
);
