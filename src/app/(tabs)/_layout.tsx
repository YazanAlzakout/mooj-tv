import { Tabs } from "expo-router/js-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AnimatedTabGlyph,
  HomeGlyph,
  LiveGlyph,
  MoreGlyph,
  MoviesGlyph,
  SeriesGlyph,
} from "@/components/TabIcons";
import { useI18n } from "@/core/i18n/I18nContext";
import { AndroidTextFix, Brand, FontFamily } from "@/core/theme/tokens";
import { themeColors, useThemeRerender } from "@/core/theme/themedStyles";

/**
 * The bottom tab bar, and the reason this app does not open on a menu.
 *
 * The player this was cloned from starts on a screen of buttons: the viewer
 * lands, reads a list of section names, taps one, watches something, and
 * comes back to the list. The first screen never shows content. Here the
 * sections live in the bar instead, so the first screen can be content and
 * moving between sections costs a thumb rather than a round trip through a
 * hub.
 *
 * ## The import is not the one the documentation gives
 *
 * `expo-router` still re-exports `Tabs` from its root, and the SDK 57
 * documentation still imports it from there — but the package's own type
 * declarations mark that path deprecated (`exports.d.ts`, "Use
 * `import { Tabs } from 'expo-router/js-tabs'` instead"). The installed
 * package wins over the published page. The vendored navigator it resolves
 * to is bundled inside expo-router, so nothing has to be installed: from SDK
 * 56 onward, importing `@react-navigation/*` in application code is no
 * longer supported at all.
 *
 * ## Which routes are tabs
 *
 * Only the five below. Players, details, search, settings and the provider
 * flow stay outside this group, which is what keeps the bar off them — a
 * tab bar over a running video is a strip of the picture thrown away.
 *
 * The directory is `(tabs)`, in parentheses, so it contributes nothing to
 * the URL: `/home` and `/live-categories` resolve exactly as they did when
 * these files sat one level up, and not one `router.push` needed changing.
 */
export default function TabsLayout() {
  // Repaints the bar — colours below are read, not computed through styles.
  useThemeRerender();
  const C = themeColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Brand.primaryLight,
        tabBarInactiveTintColor: C.textMuted,
        /*
         * The bar sits on `surface` rather than the page background so it
         * reads as a layer above the content instead of a strip of empty
         * page, and the hairline is the same one every other raised edge in
         * the app uses.
         */
        tabBarStyle: {
          /*
           * No hard rule along the top. A 1px line pinned across the screen
           * is the thing that dated this bar more than anything in it: the
           * surface is already a shade lighter than the page, which says
           * "this is a layer" without drawing a border to say it.
           */
          backgroundColor: C.surface,
          borderTopWidth: 0,
          elevation: 0,
          height: 64 + insets.bottom,
          paddingTop: 10,
          /*
           * The gesture bar on a modern Android phone overlaps the bottom of
           * the window. Without this the labels sit under it and the last
           * few pixels of every tap go to the system, not to us.
           */
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
        tabBarLabelStyle: {
          fontFamily: FontFamily.medium,
          fontSize: 10.5,
          ...AndroidTextFix,
        },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("tabs", "home"),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabGlyph Glyph={HomeGlyph} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="live-categories"
        options={{
          title: t("home", "liveTV"),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabGlyph Glyph={LiveGlyph} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="movies-categories"
        options={{
          title: t("home", "movies"),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabGlyph Glyph={MoviesGlyph} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="series-categories"
        options={{
          title: t("home", "series"),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabGlyph Glyph={SeriesGlyph} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("tabs", "more"),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabGlyph Glyph={MoreGlyph} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
