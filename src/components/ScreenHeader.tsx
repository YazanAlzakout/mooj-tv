import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { FontFamily, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

import { BackButton } from "./BackButton";

/**
 * Shared screen header: circular back button, centered title with optional
 * subtitle, and an optional right-hand slot. Every stack screen used to
 * hand-roll this row with slightly different paddings and a text "‹ Back";
 * one component keeps them identical and gives the back button a real
 * touch target instead of a bare text label.
 */
export function ScreenHeader({
  title,
  subtitle,
  right,
  onBack,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  /**
   * False on a screen that is a tab.
   *
   * A back button offers to undo a journey, and a tab is not one: there is
   * nothing behind it, so pressing it leaves the app or lands somewhere
   * arbitrary. It also takes the first thing the eye lands on and spends it
   * on a control that does nothing useful.
   */
  showBack?: boolean;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
      {/*
        The chevron is drawn rather than typed — see BackButton. That also
        settles an old problem this file used to carry a note about: a lone
        "‹" is a direction-neutral character, and Android resolved it
        against the *device* locale, so an Arabic interface on an
        English-locale phone could draw the arrow pointing the wrong way.
        A shape made of borders points where it is built to point.
      */}
      {showBack && <BackButton onPress={onBack} />}

      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.rightSlot}>{right}</View>
    </Animated.View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { color: C.text, fontSize: 17, fontFamily: FontFamily.extraBold },
  subtitle: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular, marginTop: 1 },
  rightSlot: { minWidth: 38, alignItems: "flex-end", justifyContent: "center" },
  })
);
