import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { BouncePressable } from "@/components/BouncePressable";
import { FavoriteIcon, HistoryIcon, WatchLaterIcon } from "@/components/MenuIcons";
import { useTapFeedback } from "@/core/feedback/useTapFeedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { PinPrompt, PIN_LENGTH } from "@/components/PinPrompt";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { useI18n } from "@/core/i18n/I18nContext";
import { useTheme } from "@/core/theme/ThemeContext";
import { LOCALES, type LocaleCode } from "@/core/i18n/locales";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { formatBytes } from "@/core/utils/formatBytes";
import { formatDate } from "@/core/utils/formatDate";
import { clearImageCache, imageCacheSize } from "@/core/media/imageCache";
import {
  getAppState,
  setAutoplayNextEpisode,
  setBackgroundPlayback,
  setSplitChannelView,
  setParentalLockedCategories,
  setParentalPin,
  setPreferredAudioLang,
  setPreferredSubtitleLang,
  setResumeEnabled,
  setSectionVisible,
  type AppState,
  type ContentSection,
  type ThemePreference,
} from "@/db/repositories/appStateRepository";
import { getDownloadsSummary } from "@/db/repositories/downloadRepository";
import { clearLibraryList, getLibraryCount } from "@/db/repositories/libraryRepository";
import { clearAllWatchProgress, getRecentWatchProgress } from "@/db/repositories/watchProgressRepository";
import { downloadsSupported } from "@/domain/downloads/eligibility";
import { clearActiveSession, getActiveSession, setActiveSession } from "@/state/activeSessionStore";
import { authenticate, type XtreamAccountInfo } from "@/providers/xtream/xtreamAdapter";
import { MASKED_VALUE } from "@/core/storage/maskedValue";

const THEME_OPTIONS: ThemePreference[] = ["dark", "light", "system"];
const THEME_LABEL_KEYS = {
  dark: "themeDark",
  light: "themeLight",
  system: "themeSystem",
} as const;

export default function SettingsScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t, locale, setLocale } = useI18n();
  const { preference: themePreference, setPreference: applyThemePreference } = useTheme();
  const session = getActiveSession();

  /**
   * Fire-and-forget: the repaint is immediate (every screen subscribes to
   * the theme store) and the write to the database is not something the
   * user waits on.
   */
  function setThemePreference(next: ThemePreference) {
    void applyThemePreference(next);
  }

  const [state, setState] = useState<AppState | null>(null);
  const [downloadsSummary, setDownloadsSummary] = useState<{ count: number; totalBytes: number } | null>(null);
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [pinEditorOpen, setPinEditorOpen] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  /** Set when an action needs the existing PIN before it may run. */
  const [pinChallenge, setPinChallenge] = useState<null | (() => void)>(null);
  const [stats, setStats] = useState({ history: 0, favorites: 0, watchLater: 0 });
  /**
   * A fresher `accountInfo` than the session is carrying, or null until it
   * arrives. See the effect below for why this screen fetches one.
   */
  const [freshAccountInfo, setFreshAccountInfo] = useState<XtreamAccountInfo | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    body: string;
    run: () => Promise<void>;
  } | null>(null);

  /**
   * What the account rows display: the refreshed reading once it lands,
   * and the session's own until then, so the screen never has a gap.
   */
  const accountInfo = freshAccountInfo ?? session?.accountInfo ?? null;

  useEffect(() => {
    getAppState().then(setState);
    getDownloadsSummary().then(setDownloadsSummary);
    Promise.all([
      getRecentWatchProgress(200),
      getLibraryCount("favorite"),
      getLibraryCount("watch_later"),
    ]).then(([history, favorites, watchLater]) => {
      setStats({ history: history.length, favorites, watchLater });
    });
  }, []);

  /*
    Re-read the account, once, when this screen opens.

    `accountInfo` is written by `authenticate`, and `authenticate` runs in
    exactly two places: adding a provider, and restoring the session at
    launch. So the connection count on this screen was a snapshot of the
    moment the app signed in — taken before any channel had been opened —
    and it read `0/3` forever, which is what the user reported on
    2026-09-16.

    Why this screen, and why only on open:

    - It is a screen a person opens deliberately, so one extra
      `player_api.php` call here costs nothing. Refreshing per channel
      switch would be several times the panel's request budget and
      reproduces the documented lockout, where the panel answers *every*
      endpoint — login included — with an empty 404 for minutes.
    - It is also where the number is worth having. A line reading `3/3`
      while only this device is watching is the one piece of evidence that
      the connections are being spent somewhere else, and no amount of
      reading our own code can establish that.

    The result is written back into the session as well as into local
    state, so the live player's `needsReleaseWait` sees a current
    `maxConnections` instead of the one from launch.

    Failures are swallowed deliberately: this is a nicety on a settings
    screen. If the panel is busy or rate-limiting, the previous snapshot
    stays on screen and nothing else is disturbed.
  */
  useEffect(() => {
    const current = getActiveSession();
    if (!current) return;
    let cancelled = false;

    authenticate(current.config)
      .then((result) => {
        if (cancelled) return;
        setFreshAccountInfo(result.accountInfo);
        /*
          Re-read the session rather than closing over `current`: a
          provider switch could have landed while the request was in
          flight, and writing the old provider's session back would undo
          it.
        */
        const latest = getActiveSession();
        if (latest && latest.provider.id === current.provider.id) {
          setActiveSession({ ...latest, accountInfo: result.accountInfo });
        }
      })
      .catch(() => {
        // Keep whatever the session already had.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function disconnect() {
    clearActiveSession();
    /*
     * The whole stack goes, not just this screen. `replace` alone swapped
     * Settings for Providers and left Home underneath — one hardware back
     * landed on a Home still showing the disconnected provider's name and
     * counts, where every tile bounced straight back here.
     */
    router.dismissAll();
    router.replace("/providers");
  }

  async function toggleSection(section: ContentSection, value: boolean) {
    await setSectionVisible(section, value);
    setState((prev) => (prev ? updateSectionVisible(prev, section, value) : prev));
  }

  async function toggleResume(value: boolean) {
    await setResumeEnabled(value);
    setState((prev) => (prev ? { ...prev, resumeEnabled: value } : prev));
  }

  async function toggleAutoplay(value: boolean) {
    await setAutoplayNextEpisode(value);
    setState((prev) => (prev ? { ...prev, autoplayNextEpisode: value } : prev));
  }

  async function toggleBackgroundPlayback(value: boolean) {
    await setBackgroundPlayback(value);
    setState((prev) => (prev ? { ...prev, backgroundPlayback: value } : prev));
  }

  async function toggleSplitChannelView(value: boolean) {
    await setSplitChannelView(value);
    setState((prev) => (prev ? { ...prev, splitChannelView: value } : prev));
  }

  async function toggleParentalCategories(value: boolean) {
    if (!state?.parentalPin) return;
    await setParentalLockedCategories(value);
    setState((prev) => (prev ? { ...prev, parentalLockedCategories: value } : prev));
  }

  const pinDraftComplete = pinDraft.length === PIN_LENGTH;

  /**
   * Saves only a complete PIN. An incomplete draft used to fall through to
   * `setParentalPin(null)` — so typing three digits and pressing Save
   * removed the PIN and unlocked every hidden category, with no message and
   * no way to tell it had happened.
   */
  async function savePin() {
    if (!pinDraftComplete) return;
    await setParentalPin(pinDraft);
    setState((prev) => (prev ? { ...prev, parentalPin: pinDraft } : prev));
    setPinDraft("");
    setPinEditorOpen(false);
  }

  /** Removing is its own action, reached only from the "Remove PIN" link. */
  async function removePin() {
    await setParentalPin(null);
    await setParentalLockedCategories(false);
    setState((prev) => (prev ? { ...prev, parentalPin: null, parentalLockedCategories: false } : prev));
    setPinDraft("");
    setPinEditorOpen(false);
  }

  /**
   * Runs `action` immediately when no PIN is set, otherwise asks for it
   * first. Used for the category-visibility screens, which are the whole
   * point of the lock — without this, anything hidden could simply be
   * unhidden from Settings.
   */
  function withParentalCheck(action: () => void) {
    if (state?.parentalPin && state.parentalLockedCategories) {
      setPinChallenge(() => action);
      return;
    }
    action();
  }

  function confirmClear(title: string, body: string, onConfirm: () => Promise<void>) {
    setPendingConfirm({ title, body, run: onConfirm });
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title={t("settings", "title")} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <SectionLabel>{t("settings", "appearance")}</SectionLabel>
        <Row label={t("settings", "language")} value={localeLabel(locale)} onPress={() => setLanguagePickerOpen(true)} />
        <View style={styles.staticRow}>
          <Text style={styles.staticRowLabel}>{t("settings", "theme")}</Text>
        </View>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => (
            <BouncePressable
              key={option}
              style={[styles.themeOption, themePreference === option && styles.themeOptionActive]}
              onPress={() => setThemePreference(option)}
            >
              <Text
                style={[styles.themeOptionText, themePreference === option && styles.themeOptionTextActive]}
                numberOfLines={1}
              >
                {t("settings", THEME_LABEL_KEYS[option])}
              </Text>
            </BouncePressable>
          ))}
        </View>

        <SectionLabel>{t("settings", "content")}</SectionLabel>
        {state && (
          <>
            <ToggleRow
              label={t("settings", "showLiveSection")}
              value={state.liveSectionVisible}
              onChange={(v) => toggleSection("live", v)}
            />
            <ToggleRow
              label={t("settings", "showMoviesSection")}
              value={state.moviesSectionVisible}
              onChange={(v) => toggleSection("movies", v)}
            />
            <ToggleRow
              label={t("settings", "showSeriesSection")}
              value={state.seriesSectionVisible}
              onChange={(v) => toggleSection("series", v)}
            />
          </>
        )}
        <Row label={`${t("liveCategories", "title")} — ${t("settings", "manageCategoryVisibility")}`} onPress={() => withParentalCheck(() => router.push({ pathname: "/settings/categories/[contentType]", params: { contentType: "live" } }))} />
        <Row label={`${t("moviesCategories", "title")} — ${t("settings", "manageCategoryVisibility")}`} onPress={() => withParentalCheck(() => router.push({ pathname: "/settings/categories/[contentType]", params: { contentType: "movie" } }))} />
        <Row label={`${t("seriesCategories", "title")} — ${t("settings", "manageCategoryVisibility")}`} onPress={() => withParentalCheck(() => router.push({ pathname: "/settings/categories/[contentType]", params: { contentType: "series" } }))} />


        <SectionLabel>{t("settings", "playback")}</SectionLabel>
        {state && (
          <>
            <ToggleRow label={t("settings", "resumePlayback")} value={state.resumeEnabled} onChange={toggleResume} />
            <ToggleRow
              label={t("settings", "backgroundPlayback")}
              value={state.backgroundPlayback}
              onChange={toggleBackgroundPlayback}
            />
            <ToggleRow
              label={t("settings", "modernChannelView")}
              value={state.splitChannelView}
              onChange={toggleSplitChannelView}
            />
            <Text style={styles.hintText}>{t("settings", "modernChannelViewNote")}</Text>
            <ToggleRow
              label={t("settings", "autoplayNextEpisode")}
              value={state.autoplayNextEpisode}
              onChange={toggleAutoplay}
            />
            <LanguageCodeRow
              label={t("settings", "preferredAudio")}
              value={state.preferredAudioLang}
              onChange={(v) => {
                setPreferredAudioLang(v).catch(() => {});
                setState((prev) => (prev ? { ...prev, preferredAudioLang: v } : prev));
              }}
            />
            <LanguageCodeRow
              label={t("settings", "preferredSubtitle")}
              value={state.preferredSubtitleLang}
              onChange={(v) => {
                setPreferredSubtitleLang(v).catch(() => {});
                setState((prev) => (prev ? { ...prev, preferredSubtitleLang: v } : prev));
              }}
            />
          </>
        )}

        <SectionLabel>{t("settings", "storage")}</SectionLabel>
        <View style={styles.infoCard}>
          <InfoRow
            label={t("settings", "downloadedContent")}
            value={
              downloadsSummary
                ? `${downloadsSummary.count} · ${formatBytes(downloadsSummary.totalBytes)}`
                : "—"
            }
          />
        </View>
        {downloadsSupported() && (
          <Row label={t("settings", "manageDownloads")} onPress={() => router.push("/downloads")} />
        )}

        <SectionLabel>{t("settings", "data")}</SectionLabel>
        <Row label={t("history", "title")} onPress={() => router.push("/history")} />
        <Row
          label={t("settings", "clearWatchHistory")}
          onPress={() =>
            confirmClear(t("settings", "clearWatchHistory"), t("settings", "clearConfirmBody"), clearAllWatchProgress)
          }
          destructive
        />
        <Row
          label={t("settings", "clearFavorites")}
          onPress={() =>
            confirmClear(t("settings", "clearFavorites"), t("settings", "clearConfirmBody"), () =>
              clearLibraryList("favorite")
            )
          }
          destructive
        />
        <Row
          label={t("settings", "clearWatchLater")}
          onPress={() =>
            confirmClear(t("settings", "clearWatchLater"), t("settings", "clearConfirmBody"), () =>
              clearLibraryList("watch_later")
            )
          }
          destructive
        />

        <SectionLabel>{t("parental", "title")}</SectionLabel>
        <Row
          label={state?.parentalPin ? t("parental", "changePin") : t("parental", "setPin")}
          onPress={() => {
            setPinDraft("");
            setPinEditorOpen(true);
          }}
        />
        {state && (
          <ToggleRow
            label={t("parental", "lockCategories")}
            value={state.parentalLockedCategories}
            onChange={toggleParentalCategories}
          />
        )}
        <Text style={styles.hintText}>
          {state?.parentalPin ? t("parental", "lockCategoriesNote") : t("parental", "noPinYet")}
        </Text>

        <Row
          label={`${t("settings", "clearImageCache")} · ${formatBytes(imageCacheSize())}`}
          onPress={() =>
            confirmClear(t("settings", "clearImageCache"), t("settings", "clearConfirmBody"), async () => {
              clearImageCache();
            })
          }
        />

        <SectionLabel>{t("settings", "legal")}</SectionLabel>
        <Row label={t("settings", "termsConditions")} onPress={() => router.push("/legal")} />
        {/*
          Required, not optional, and required *here* rather than only on
          the website. Google's Developer Program Policy (effective
          29 October 2026) asks for the policy link in the Play Console
          field "as well as a privacy policy link or text within the app
          itself" — an app that links it only from its store listing is
          half compliant. This opens the text, carried in the app, in the
          viewer's own language.
        */}
        <Row label={t("settings", "privacyPolicy")} onPress={() => router.push("/privacy")} />

        {/*
          Last but one, and it used to be third.

          Everything above this point is something a viewer changes.
          This card is something they read: the line they are on, when
          it expires, how many connections it carries. Useful, looked up
          perhaps twice in the life of an install, and it was sitting
          between the appearance settings and the playback ones pushing
          both apart — eight rows of text to scroll past to reach a
          switch. Settings that are adjusted come first; settings that
          are consulted come last.

          Manage providers and Disconnect travel with it rather than
          staying behind. They act on the account this card describes,
          and one of them ends the session — neither belongs in the
          part of the page a thumb sweeps through.
        */}
        <SectionLabel>{t("settings", "accountProvider")}</SectionLabel>
        {session && (
          <View style={styles.infoCard}>
            <InfoRow label={t("settings", "provider")} value={session.provider.name} />
            {/*
              The server is masked, not printed. This card was the easiest
              place in the app to read an account off an unlocked phone —
              see core/storage/maskedValue.ts for what that is and is not
              worth. The provider's name above stays visible: the viewer
              chose it and it identifies the account without revealing it.
            */}
            <InfoRow label={t("settings", "server")} value={MASKED_VALUE} />
            {/*
              The username is shown; the server and the password are not.

              A username identifies a line, a password authenticates it, and
              masking the identifier costs support the one thing it needs
              while buying almost nothing: whoever reads it off the screen
              still cannot use it. Support asks "which line is this?" and
              this row is the answer, without the viewer having to find the
              paperwork they signed up with (2026-09-17).

              There is no password row here and there must not be one. The
              server stays masked because together with a weak password it
              is the whole attack surface — see
              core/storage/maskedValue.ts, which is also honest about how
              little any of this masking is worth on a cleartext panel.
            */}
            <InfoRow label={t("settings", "username")} value={session.config.username} />
            {/*
              Status, expiry, connections and the output formats are *not*
              repeated here. The card lower down this page already carries
              all four, in larger type, and a page that states the same
              four facts twice makes a reader check whether they disagree.
              What stays here is what that card does not say: which
              provider, which server, which login, and the server's clock —
              the things you would read out to support.
            */}
            {accountInfo?.serverTimezone && (
              <InfoRow label={t("settings", "serverTimezone")} value={accountInfo.serverTimezone} />
            )}
          </View>
        )}
        <Row label={t("settings", "manageProviders")} onPress={() => router.push("/providers")} />
        <Row label={t("settings", "disconnect")} onPress={disconnect} destructive />

        {/*
          The status card and the activity counts, at the foot.

          They were the first two things on this page, and neither is a
          setting: one says when the line expires and how many of its
          connections are in use, the other counts what the viewer has
          watched and saved. Both are read, not changed — so between them
          they pushed every switch on the page down by a screen and a
          half, and the first thing anyone opening Settings had to do was
          scroll past information they had not come for.

          Everything above this line is adjustable. Everything from here
          down is something to look at.
        */}
        {session && (
          <View>
            <View style={styles.accountCard}>
              <View style={styles.accountBanner}>
                <View style={styles.accountBannerLeft}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: accountInfo?.status === "Active" ? themeColors().success : themeColors().error },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: accountInfo?.status === "Active" ? themeColors().success : themeColors().error },
                    ]}
                  >
                    {accountInfo?.status ?? "—"}
                  </Text>
                </View>
                <Text style={styles.accountProviderName} numberOfLines={1}>
                  {session.provider.name}
                </Text>
              </View>
              <View style={styles.chipsRow}>
                <AccountChip
                  label={t("settings", "expiresOn")}
                  value={
                    accountInfo?.expiresAt != null
                      ? formatDate(accountInfo.expiresAt)
                      : t("settings", "neverExpires")
                  }
                  tint={Brand.primary}
                />
                <AccountChip
                  label={t("settings", "connections")}
                  value={
                    accountInfo?.maxConnections != null
                      ? `${accountInfo.activeConnections ?? "—"}/${accountInfo.maxConnections}`
                      : "—"
                  }
                  tint="#8B5CF6"
                />
                <AccountChip
                  label={t("settings", "outputFormats")}
                  value={accountInfo?.allowedOutputFormats[0]?.toUpperCase() ?? "—"}
                  tint="#06B6D4"
                />
              </View>
            </View>
          </View>
        )}

        <SectionHeader title={t("settings", "yourActivity")} />
        <View style={styles.statsRow}>
          {/*
            The same drawn marks the More list uses. These were "◷", "★"
            and a plus sign: one rare glyph, one that renders as colour
            emoji on some Android builds, and one that is simply a plus.
            Three different weights pretending to be a set.
          */}
          <StatCard Icon={HistoryIcon} tint="#06B6D4" count={stats.history} label={t("history", "title")} />
          <StatCard Icon={FavoriteIcon} tint="#EC4899" count={stats.favorites} label={t("home", "favorites")} />
          <StatCard Icon={WatchLaterIcon} tint="#F59E0B" count={stats.watchLater} label={t("home", "watchLater")} />
        </View>

        <SectionLabel>{t("settings", "about")}</SectionLabel>
        <View style={styles.infoCard}>
          <InfoRow label={t("settings", "appVersion")} value={Constants.expoConfig?.version ?? "—"} />
          <InfoRow label={t("settings", "package")} value={Constants.expoConfig?.android?.package ?? "—"} />
        </View>
      </ScrollView>

      <LanguagePickerModal
        visible={languagePickerOpen}
        current={locale}
        onSelect={(code) => {
          setLanguagePickerOpen(false);
          setLocale(code);
        }}
        onClose={() => setLanguagePickerOpen(false)}
      />
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ""}
        message={pendingConfirm?.body ?? ""}
        confirmLabel={t("common", "clear")}
        danger
        onConfirm={async () => {
          const pending = pendingConfirm;
          setPendingConfirm(null);
          if (pending) await pending.run();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <Modal visible={pinEditorOpen} transparent animationType="fade" onRequestClose={() => setPinEditorOpen(false)}>
        <Pressable style={styles.pinBackdrop} focusable={false} onPress={() => setPinEditorOpen(false)}>
          <Pressable style={styles.pinCard} focusable={false} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.pinTitle}>{t("parental", "setPin")}</Text>
            <TextInput
              style={styles.pinInput}
              value={pinDraft}
              onChangeText={(value) => setPinDraft(value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
              maxLength={PIN_LENGTH}
              placeholder={"\u2022".repeat(PIN_LENGTH)}
              placeholderTextColor={themeColors().textMuted}
            />
            <BouncePressable
              style={[styles.pinSave, !pinDraftComplete && styles.pinSaveDisabled]}
              disabled={!pinDraftComplete}
              onPress={savePin}
            >
              <Text style={styles.pinSaveText}>{t("common", "save")}</Text>
            </BouncePressable>
            {state?.parentalPin && (
              <Focusable onPress={removePin}>
                <Text style={styles.pinRemoveText}>{t("parental", "removePin")}</Text>
              </Focusable>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <PinPrompt
        visible={pinChallenge !== null}
        expectedPin={state?.parentalPin ?? ""}
        title={t("parental", "enterPin")}
        onCancel={() => setPinChallenge(null)}
        onSuccess={() => {
          const action = pinChallenge;
          setPinChallenge(null);
          action?.();
        }}
      />
    </ScreenBackground>
  );
}

function AccountChip({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <View style={styles.accountChip}>
      <View style={[styles.accountChipDot, { backgroundColor: tint }]} />
      <Text style={styles.accountChipLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.accountChipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function StatCard({
  Icon,
  tint,
  count,
  label,
}: {
  Icon: (props: { color: string; size: number }) => React.ReactNode;
  tint: string;
  count: number;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: `${tint}22` }]}>
        <Icon color={tint} size={19} />
      </View>
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function updateSectionVisible(state: AppState, section: ContentSection, value: boolean): AppState {
  if (section === "live") return { ...state, liveSectionVisible: value };
  if (section === "movies") return { ...state, moviesSectionVisible: value };
  return { ...state, seriesSectionVisible: value };
}

function localeLabel(code: LocaleCode): string {
  return LOCALES.find((l) => l.code === code)?.label ?? code;
}

function LanguagePickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: LocaleCode;
  onSelect: (code: LocaleCode) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} focusable={false} onPress={onClose}>
        <Pressable style={styles.modalSheet} focusable={false} onPress={(e) => e.stopPropagation()}>
          {/*
            A heading, which this sheet did not have.

            The one in onboarding does, and a list of six words with no
            title is a list of six words: it opens over the page it was
            called from and nothing on it says what choosing does. One
            line fixes that.
          */}
          <Text style={styles.modalTitle}>{t("settings", "language")}</Text>
          {LOCALES.map((l) => (
            <Focusable
              key={l.code}
              style={styles.modalOptionRow}
              hasTVPreferredFocus={l.code === current}
              onPress={() => onSelect(l.code)}
            >
              <Text style={[styles.modalOptionText, l.code === current && styles.modalOptionTextActive]}>
                {l.label}
              </Text>
            </Focusable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelBar} />
      <Text style={styles.sectionLabelText}>{children}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * One settings row, and the tick it answers with.
 *
 * The feedback hook is taken here rather than threaded down from the
 * screen, unlike the More list — this screen has upwards of twenty rows
 * but only a handful are mounted as components at once, and the
 * alternative is twenty props. Each instance loads the same cached asset.
 */
function Row({
  label,
  value,
  onPress,
  destructive,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const tap = useTapFeedback();
  return (
    <BouncePressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.row}
    >
      <Text style={[styles.rowText, destructive && styles.rowTextDestructive]}>{label}</Text>
      {value && <Text style={styles.rowValue}>{value}</Text>}
      {!destructive && <Text style={styles.rowChevron}>›</Text>}
    </BouncePressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const tap = useTapFeedback();
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(next) => {
          tap();
          onChange(next);
        }}
        trackColor={{ true: Brand.primary }}
      />
    </View>
  );
}

function LanguageCodeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <TextInput
        style={styles.rowInput}
        value={value ?? ""}
        onChangeText={(v) => onChange(v.trim() || null)}
        placeholder="—"
        placeholderTextColor={themeColors().textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  pinBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  pinCard: {
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: Radii.xl,
    backgroundColor: C.surface,
  },
  pinTitle: { color: C.text, fontSize: 15, lineHeight: 24, fontFamily: FontFamily.bold },
  pinInput: {
    width: "100%",
    textAlign: "center",
    letterSpacing: 8,
    color: C.text,
    fontSize: 22,
    fontFamily: FontFamily.bold,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  pinSave: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    backgroundColor: Brand.primary,
  },
  pinSaveDisabled: { opacity: 0.4 },
  pinSaveText: { color: C.onAccent, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.bold },
  pinRemoveText: { color: C.error, fontSize: 12, lineHeight: 20, fontFamily: FontFamily.semiBold },
  safeArea: { flex: 1 },

  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },

  accountCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.xl,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  accountBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    backgroundColor: Brand.primaryMuted,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  accountBannerLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 13, fontFamily: FontFamily.bold },
  accountProviderName: { flex: 1, color: C.text, fontSize: 13, fontFamily: FontFamily.semiBold, textAlign: "right" },
  chipsRow: { flexDirection: "row", gap: Spacing.sm, padding: Spacing.md },
  accountChip: {
    flex: 1,
    backgroundColor: C.surfaceElevated,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    alignItems: "center",
    gap: 3,
  },
  accountChipDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  accountChipLabel: { color: C.textMuted, fontSize: 9, fontFamily: FontFamily.regular, textAlign: "center" },
  accountChipValue: { color: C.text, fontSize: 12, fontFamily: FontFamily.bold, textAlign: "center" },

  statsRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.xs,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center" },
  statGlyph: { fontSize: 16, fontFamily: FontFamily.bold },
  statCount: { color: C.text, fontSize: 19, fontFamily: FontFamily.extraBold },
  statLabel: { color: C.textMuted, fontSize: 10, fontFamily: FontFamily.regular },

  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  sectionLabelBar: { width: 3, height: 16, borderRadius: 2, backgroundColor: Brand.primary },
  sectionLabelText: { color: C.text, fontSize: 14, fontFamily: FontFamily.bold },

  hintText: {
    color: C.textMuted,
    fontSize: 11,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    marginTop: 2,
    paddingBottom: Spacing.sm,
  },

  infoCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.md },
  infoLabel: { color: C.textMuted, fontSize: 12, fontFamily: FontFamily.regular },
  infoValue: { flex: 1, color: C.text, fontSize: 12, fontFamily: FontFamily.medium, textAlign: "right" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowText: { flex: 1, color: C.text, fontSize: 13, fontFamily: FontFamily.medium },
  rowTextDestructive: { color: C.error },
  rowValue: { color: C.textMuted, fontSize: 12, fontFamily: FontFamily.regular },
  rowChevron: { color: C.textMuted, fontSize: 18, fontFamily: FontFamily.regular },
  rowInput: {
    color: C.text,
    fontSize: 13,
    fontFamily: FontFamily.regular,
    minWidth: 80,
    textAlign: "right",
  },

  staticRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  staticRowLabel: { color: C.text, fontSize: 13, fontFamily: FontFamily.medium },
  staticRowValue: { color: C.textMuted, fontSize: 12, fontFamily: FontFamily.regular },

  /**
   * A segmented control rather than a modal picker: three options is
   * few enough to show outright, and a theme is something people try
   * back and forth rather than set once.
   */
  themeRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
  themeOption: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.md,
    backgroundColor: C.fillSubtle,
  },
  themeOptionActive: { backgroundColor: Brand.primary },
  themeOptionText: {
    color: C.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FontFamily.semiBold,
    ...AndroidTextFix,
  },
  themeOptionTextActive: { color: C.onAccent },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    color: C.text,
    fontSize: 15,
    fontFamily: FontFamily.bold,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    ...AndroidTextFix,
  },
  modalOptionRow: { paddingVertical: Spacing.md },
  modalOptionText: { color: C.textSecondary, fontSize: 15, fontFamily: FontFamily.medium },
  modalOptionTextActive: { color: Brand.primaryLight, fontFamily: FontFamily.bold },
  })
);
