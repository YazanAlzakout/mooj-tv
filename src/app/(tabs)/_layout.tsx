import { Tabs } from "expo-router/js-tabs";

import { MoojTabBar } from "@/components/MoojTabBar";
import { useI18n } from "@/core/i18n/I18nContext";

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
  /*
   * Only the labels are read here now. The bar reads the palette itself
   * and subscribes itself to theme changes, because it is the thing that
   * repaints — this layout only names the screens.
   */
  const { t } = useI18n();

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      /*
       * The bar is drawn here rather than configured.
       *
       * What the design needs — a capsule floating clear of the screen
       * edges, a spotlight that slides to the tab you press, a click and
       * a haptic tick — is not a set of options on the stock bar. It is a
       * different bar, so this is one. See MoojTabBar for how the cone is
       * drawn without a gradient or an SVG renderer.
       */
      tabBar={(props) => <MoojTabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t("tabs", "home"),
        }}
      />
      <Tabs.Screen
        name="live-categories"
        options={{
          title: t("home", "liveTV"),
        }}
      />
      <Tabs.Screen
        name="movies-categories"
        options={{
          title: t("home", "movies"),
        }}
      />
      <Tabs.Screen
        name="series-categories"
        options={{
          title: t("home", "series"),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t("tabs", "more"),
        }}
      />
    </Tabs>
  );
}
