import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useI18n } from "@/core/i18n/I18nContext";
import { FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles } from "@/core/theme/themedStyles";

import { BouncePressable } from "./BouncePressable";

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
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const { t, isRTL } = useI18n();

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
      <BouncePressable
        style={styles.backButton}
        onPress={onBack ?? (() => router.back())}
        accessibilityLabel={t("common", "back")}
        accessibilityRole="button"
      >
        {/*
          Chosen from the interface language, not left to the platform.
          A lone "‹" is a direction-neutral character, and Android resolves
          a neutral-only string against the *device* locale — so an Arabic
          interface on an English-locale phone drew a right-edge back button
          pointing left. Kurdish Sorani is almost never a device locale, so
          for those users it was wrong every time.
        */}
        <Text style={styles.backButtonText}>{isRTL ? "›" : "‹"}</Text>
      </BouncePressable>

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
  backButton: {
    width: 38,
    height: 38,
    borderRadius: Radii.pill,
    backgroundColor: C.fillSubtle,
    borderColor: C.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: C.text, fontSize: 22, fontFamily: FontFamily.bold, marginTop: -3 },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { color: C.text, fontSize: 17, fontFamily: FontFamily.extraBold },
  subtitle: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular, marginTop: 1 },
  rightSlot: { minWidth: 38, alignItems: "flex-end", justifyContent: "center" },
  })
);
