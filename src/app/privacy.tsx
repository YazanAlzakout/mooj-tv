import Constants from "expo-constants";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { BRAND } from "@/core/brand";
import { useI18n } from "@/core/i18n/I18nContext";
import type { TranslationShape } from "@/core/i18n/translations/en";
import { Brand, FontFamily, Radii, Spacing, AndroidTextFix } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";

/**
 * The privacy policy, in the app.
 *
 * ## Why it is a screen and not a link
 *
 * Google requires the policy in two places: the URL in the Play Console
 * field, and "a privacy policy link or text within the app itself"
 * (Developer Program Policy, effective 29 October 2026). A link would
 * satisfy the letter of it and fails in the three situations that
 * actually come up — a reviewer with no network, a viewer on a metered
 * connection, and the day the website is between hosts. The text is here,
 * in the language the viewer has chosen, and works with the radio off.
 *
 * The same words are published at mooj-player.com/privacy.html. They have
 * to stay the same words: two versions of a policy that differ is worse
 * than one of them not existing, because whichever a reader found, the
 * other could be held against it.
 *
 * ## No accept button
 *
 * The terms screen has one, because terms are agreed to. A privacy policy
 * is a disclosure — it describes what the app does whether or not anybody
 * presses anything, and a button implying otherwise would misrepresent it.
 */

type SectionKey = keyof TranslationShape["privacy"]["sections"];

/**
 * Reading order, written out rather than taken from `Object.keys`.
 *
 * A policy is read top to bottom and its order is an argument: what the
 * app collects, then what it keeps, then where anything goes, then how to
 * get rid of it. Object key order would survive a refactor by luck.
 */
const SECTION_ORDER: SectionKey[] = [
  "summary",
  "noCollection",
  "credentials",
  "onDevice",
  "network",
  "permissions",
  "children",
  "retention",
  "security",
  "changes",
  "contact",
];

export default function PrivacyScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t, strings } = useI18n();
  const privacy = strings.privacy;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title={privacy.title}
          subtitle={`${privacy.lastUpdatedLabel}: ${privacy.lastUpdatedDate}`}
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(360)} style={styles.intro}>
            <Text style={styles.introText}>{privacy.intro}</Text>
          </Animated.View>

          {SECTION_ORDER.map((key, index) => {
            const section = privacy.sections[key];
            return (
              <Animated.View
                key={key}
                /*
                 * A short, capped cascade. Eleven sections at 40ms each
                 * would still be arriving a second after the screen opened,
                 * which on a document reads as a slow screen rather than as
                 * motion; past the sixth they all arrive together.
                 */
                entering={FadeInUp.delay(Math.min(index, 6) * 45).duration(320)}
                style={styles.section}
              >
                <View style={styles.headingRow}>
                  <View style={styles.headingBar} />
                  <Text style={styles.heading}>{section.heading}</Text>
                </View>
                {section.body.map((paragraph, i) => (
                  <Text key={i} style={styles.body}>
                    {paragraph}
                  </Text>
                ))}
              </Animated.View>
            );
          })}

          {/*
            The name, then the build — and the build is a *number*.

            This line read `{t("settings","appVersion")} · Mooj TV`, which
            printed the label and no value: "App version · Mooj TV", and in
            the default locale "إصدار التطبيق · Mooj TV". `settings.appVersion`
            has only ever been a label — there is no key anywhere holding a
            version number, because the number lives in the manifest, and the
            "App version" row in the About card on the settings screen
            already reads it from there. (A name rather than a line number:
            the first version of this note said `settings.tsx:527`, and by the
            next day the row was at 644.) The fallback is an em dash rather
            than an empty string, which is the answer that same row gives when
            the manifest has nothing: an empty one would print the label with
            nothing after it, which is the defect.

            The name comes from `BRAND.displayName` for the reason
            brand.config.js was written: the brand used to be "spread over
            six unrelated places … a hard-coded string in the home screen".
            This was the last hard-coded "Mooj TV" anywhere under src/app or
            src/components, so a second brand built from this tree would
            have shipped a privacy policy signed with the first one's name.
          */}
          <Text style={styles.footer}>
            {`${BRAND.displayName} · ${t("settings", "appVersion")} ${Constants.expoConfig?.version ?? "—"}`}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },

    intro: {
      borderStartWidth: 3,
      borderStartColor: Brand.primary,
      paddingStart: Spacing.md,
      paddingVertical: Spacing.xs,
    },
    introText: {
      color: C.textSecondary,
      fontSize: 14.5,
      lineHeight: 23,
      fontFamily: FontFamily.regular,
      ...AndroidTextFix,
    },

    section: {
      backgroundColor: C.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: Spacing.lg,
      gap: Spacing.sm,
    },
    headingRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
    /* The same accent mark the section headers use on the browse screens. */
    headingBar: {
      width: 3,
      height: 17,
      borderRadius: 2,
      backgroundColor: Brand.primary,
    },
    heading: {
      flex: 1,
      color: C.text,
      fontSize: 16,
      fontFamily: FontFamily.bold,
      ...AndroidTextFix,
    },
    body: {
      color: C.textSecondary,
      fontSize: 14.5,
      lineHeight: 23,
      fontFamily: FontFamily.regular,
      ...AndroidTextFix,
    },

    footer: {
      color: C.textMuted,
      fontSize: 12,
      textAlign: "center",
      fontFamily: FontFamily.regular,
      ...AndroidTextFix,
    },
  })
);
