import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useI18n } from "@/core/i18n/I18nContext";
import { isTvBuild } from "@/core/platform/isTvBuild";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { AndroidTextFix, FontFamily, Radii, Spacing } from "@/core/theme/tokens";

/**
 * The open-source notices, in the app.
 *
 * ## Why this screen exists
 *
 * This app ships `libffmpegJNI.so`, which statically links FFmpeg's
 * `libavcodec`, `libavutil` and `libswresample` under **LGPL 2.1+** — see
 * docs/THIRD_PARTY_LICENSES.md. The LGPL requires that the people who receive
 * the binary are told it is in there and under what terms. Until 2026-11-14
 * they were not told anywhere: there was no licences screen, no NOTICE asset,
 * and nothing in the listing.
 *
 * ## What this screen is not
 *
 * It is a notice, not a clearance. docs/THIRD_PARTY_LICENSES.md still records
 * an open item in the project's own words — a review of the built `.so`'s
 * linked symbols and of how the relinking obligation is satisfied by loading
 * the library through JNI. Shipping this screen does not close that; it closes
 * the separate and simpler failure of not telling anyone at all.
 *
 * ## Why the body is in English
 *
 * The component names, the licence names and the project URLs are proper
 * nouns, and a licence identifier that has been translated is no longer the
 * identifier. The title and the opening line follow the viewer's language; the
 * notices themselves are quoted as they are published.
 *
 * ## Why each card is focusable on the television
 *
 * 2026-11-18. Nothing inside the scroll area could take focus, and the only
 * control that could was the back chevron in the header — which sits outside
 * it. A `ScrollView` scrolls from a D-pad only as a side effect of focus
 * moving into something inside it (Android scrolls a newly focused view into
 * view, and React Native's `ScrollView` has no key handling of its own), so
 * every arrow press found nothing and the page never moved. Ten entries,
 * several with multi-line notes, run well past one screenful of a 720dp
 * television minus its overscan: everything from roughly the fourth entry
 * down was unreachable. The FFmpeg notice this screen exists to deliver is
 * first and did survive — which is the only reason this was a defect in the
 * screen rather than in the obligation.
 *
 * So on the box each card becomes a stop for the focus ring, exactly as the
 * section cards in legal.tsx do — the long note above that screen's
 * `sections.map` is the same mechanism written out at length, and this screen
 * is deliberately its twin rather than a second answer to one question.
 * `onPress` does nothing on purpose: the card is not a button, it is somewhere
 * for Down to go. The phone keeps the plain `View` and pays nothing.
 */

type Entry = {
  name: string;
  licence: string;
  note?: string;
  url: string;
};

const ENTRIES: Entry[] = [
  {
    name: "FFmpeg (libavcodec, libavutil, libswresample)",
    licence: "LGPL 2.1 or later",
    note:
      "Statically linked into libffmpegJNI.so and loaded dynamically through JNI. " +
      "Built from FFmpeg release/6.0 with only the mp2 decoder enabled, without " +
      "--enable-gpl, and without libavformat or libavfilter.",
    url: "https://ffmpeg.org",
  },
  {
    name: "AndroidX Media3 (decoder_ffmpeg wrapper)",
    licence: "Apache License 2.0",
    note:
      "FfmpegAudioRenderer, FfmpegAudioDecoder, FfmpegLibrary and " +
      "FfmpegDecoderException, vendored from androidx/media at tag 1.8.0.",
    url: "https://github.com/androidx/media",
  },
  {
    name: "React Native",
    licence: "MIT License",
    url: "https://github.com/facebook/react-native",
  },
  {
    name: "React Native for TV (react-native-tvos)",
    licence: "MIT License",
    url: "https://github.com/react-native-tvos/react-native-tvos",
  },
  {
    name: "Expo and the Expo modules used by this app",
    licence: "MIT License",
    url: "https://github.com/expo/expo",
  },
  {
    name: "React Native Reanimated",
    licence: "MIT License",
    url: "https://github.com/software-mansion/react-native-reanimated",
  },
  {
    name: "React Native Gesture Handler",
    licence: "MIT License",
    url: "https://github.com/software-mansion/react-native-gesture-handler",
  },
  {
    name: "React Native Screens",
    licence: "MIT License",
    url: "https://github.com/software-mansion/react-native-screens",
  },
  {
    name: "React Native Safe Area Context",
    licence: "MIT License",
    url: "https://github.com/AppAndFlow/react-native-safe-area-context",
  },
  {
    name: "Noto Kufi Arabic",
    licence: "SIL Open Font License 1.1",
    url: "https://fonts.google.com/noto/specimen/Noto+Kufi+Arabic",
  },
];

export default function LicencesScreen() {
  useThemeRerender();
  const { t } = useI18n();

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScreenHeader title={t("settings", "licences")} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>{t("settings", "licencesIntro")}</Text>

          {ENTRIES.map((entry, index) => {
            const body = (
              <>
                <Text style={styles.name}>{entry.name}</Text>
                <Text style={styles.licence}>{entry.licence}</Text>
                {entry.note ? <Text style={styles.note}>{entry.note}</Text> : null}
                <Text style={styles.url} selectable>
                  {entry.url}
                </Text>
              </>
            );

            /* The first card takes the initial focus so the remote starts in
               the notices rather than on the back chevron — Up from here
               still reaches it, and that is the right way round. */
            return isTvBuild ? (
              <Focusable
                key={entry.name}
                onPress={() => {}}
                style={styles.card}
                hasTVPreferredFocus={index === 0}
              >
                {body}
              </Focusable>
            ) : (
              <View key={entry.name} style={styles.card}>
                {body}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scroll: { flex: 1 },
    content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xl },
    intro: {
      color: C.textSecondary,
      fontSize: 13,
      lineHeight: 21,
      fontFamily: FontFamily.regular,
      marginBottom: Spacing.xs,
      ...AndroidTextFix,
    },
    card: {
      backgroundColor: C.fillSubtle,
      borderRadius: Radii.md,
      padding: Spacing.md,
      gap: 4,
    },
    name: {
      color: C.text,
      fontSize: 14,
      lineHeight: 21,
      fontFamily: FontFamily.semiBold,
      ...AndroidTextFix,
    },
    licence: {
      color: C.textSecondary,
      fontSize: 12.5,
      lineHeight: 19,
      fontFamily: FontFamily.medium,
      ...AndroidTextFix,
    },
    note: {
      color: C.textMuted,
      fontSize: 11.5,
      lineHeight: 18,
      fontFamily: FontFamily.regular,
      ...AndroidTextFix,
    },
    url: {
      color: C.textMuted,
      fontSize: 11.5,
      lineHeight: 18,
      fontFamily: FontFamily.regular,
      ...AndroidTextFix,
    },
  })
);
