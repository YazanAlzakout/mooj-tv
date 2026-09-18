import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { BouncePressable } from "@/components/BouncePressable";
import { Focusable } from "@/components/Focusable";
import { isTvBuild } from "@/core/platform/isTvBuild";
import { ScreenBackground } from "@/components/ScreenBackground";
import { CURRENT_LEGAL_VERSION } from "@/core/legal/legalVersion";
import { useI18n } from "@/core/i18n/I18nContext";
import type { TranslationShape } from "@/core/i18n/translations/en";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { getAppState, setLegalAccepted } from "@/db/repositories/appStateRepository";

type SectionKey = keyof TranslationShape["legal"]["sections"];

/** Reading order for the sectioned terms — EULA/ToS/DMCA content ported verbatim from the previous app's already-reviewed legal copy. */
const SECTION_ORDER: SectionKey[] = [
  "scopeAndAcceptance",
  "noContentProvided",
  "userProvidedContent",
  "userResponsibility",
  "noAffiliation",
  "prohibitedUses",
  "thirdPartyServices",
  "termination",
  "disclaimers",
  "limitationOfLiability",
  "indemnification",
  "dmcaNotice",
  "dmcaHowToSubmit",
  "governingLaw",
  "contact",
];

export default function LegalScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t, strings } = useI18n();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isGate = mode === "gate";

  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    getAppState().then((state) => setAccepted(state.legalAcceptedVersion === CURRENT_LEGAL_VERSION));
  }, []);

  async function accept() {
    await setLegalAccepted(CURRENT_LEGAL_VERSION);
    if (isGate) router.replace("/providers");
    else router.back();
  }

  const legal = strings.legal;
  const sections = SECTION_ORDER.map((key) => legal.sections[key]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          {!isGate && (
            <BouncePressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>‹ {t("common", "back")}</Text>
            </BouncePressable>
          )}
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {legal.title}
            </Text>
            <Text style={styles.subtitle}>
              {legal.lastUpdatedLabel}: {legal.lastUpdatedDate}
            </Text>
          </View>
          {!isGate && <View style={styles.backButton} />}
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.delay(80).duration(500)} style={styles.hero}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>▤</Text>
            </View>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroTitle}>{legal.eulaTitle}</Text>
              <Text style={styles.heroTitle}>{legal.tosTitle}</Text>
              <Text style={styles.heroTitle}>{legal.dmcaTitle}</Text>
            </View>
          </Animated.View>

          {/*
            On a television each card is **focusable**, and that is the only
            way this screen can be read with a remote.

            A `ScrollView` scrolls from a D-pad only as a side effect of
            focus moving into something inside it: Android scrolls a newly
            focused view into view, and React Native's `ScrollView` has no
            key handling of its own. Every child here was a plain `View`,
            and the Accept button is a *sibling* of the scroll area rather
            than inside it — so arrow keys had nothing to move to and the
            page never scrolled. In gate mode there is also no back button
            (`:64`, `:77`), so a viewer saw one screenful of a long
            agreement and the only thing they could press was Accept. They
            were agreeing to text they had no way to reach.

            `onPress` does nothing on purpose. The card is not a button; it
            is a stop for the focus ring so that Down means "read on".

            The first card takes initial focus so the remote starts in the
            document rather than on Accept — the order matters here more
            than on any other screen in the app.

            The phone keeps plain `Animated.View`s and its entrance
            animation: it scrolls by touch and has no focus ring to show.
          */}
          {sections.map((section, i) => {
            const body = (
              <>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionIndexPill}>
                    <Text style={styles.sectionIndexText}>{String(i + 1).padStart(2, "0")}</Text>
                  </View>
                  <Text style={styles.sectionHeading}>{section.heading}</Text>
                </View>
                {section.body.map((paragraph, idx) => (
                  <View key={idx} style={styles.paragraphRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.paragraph}>{paragraph}</Text>
                  </View>
                ))}
              </>
            );

            return isTvBuild ? (
              <Focusable
                key={i}
                onPress={() => {}}
                style={styles.sectionCard}
                hasTVPreferredFocus={i === 0}
              >
                {body}
              </Focusable>
            ) : (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(Math.min(i * 40, 400)).duration(400).springify().damping(16)}
                style={styles.sectionCard}
              >
                {body}
              </Animated.View>
            );
          })}
        </ScrollView>

        {!accepted && (
          <Animated.View entering={FadeInUp.delay(200).duration(500)} style={styles.acceptBar}>
            <BouncePressable style={styles.acceptButton} onPress={accept}>
              <Text style={styles.acceptButtonText}>{t("legal", "acceptButton")}</Text>
            </BouncePressable>
          </Animated.View>
        )}

        {!isGate && accepted && (
          <View style={styles.acceptedBanner}>
            <Text style={styles.acceptedBannerText}>{t("legal", "accepted")}</Text>
          </View>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  backButton: { minWidth: 64, paddingVertical: Spacing.xs },
  backButtonText: { color: Brand.primaryLight, fontSize: 15, fontFamily: FontFamily.semiBold },
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: { color: C.text, fontSize: 17, fontFamily: FontFamily.extraBold },
  subtitle: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular, marginTop: 2 },

  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: Radii.lg,
    backgroundColor: Brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBadgeText: { color: Brand.primary, fontSize: 22 },
  heroTextCol: { flex: 1, gap: 2 },
  heroTitle: { color: C.text, fontSize: 13, fontFamily: FontFamily.bold },

  sectionCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionIndexPill: {
    minWidth: 32,
    height: 26,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radii.md,
    backgroundColor: Brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIndexText: { color: Brand.primaryLight, fontSize: 11, fontFamily: FontFamily.extraBold },
  sectionHeading: { flex: 1, color: C.text, fontSize: 13, fontFamily: FontFamily.bold },
  paragraphRow: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, marginBottom: Spacing.xs },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 7, backgroundColor: C.textMuted },
  paragraph: { flex: 1, color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.regular, lineHeight: 18 },

  acceptBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  acceptButton: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  acceptButtonText: { color: C.onAccent, fontSize: 15, fontFamily: FontFamily.bold },

  acceptedBanner: { alignItems: "center", paddingBottom: Spacing.lg },
  acceptedBannerText: { color: C.success, fontSize: 13, fontFamily: FontFamily.semiBold },
  })
);
