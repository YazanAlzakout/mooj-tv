import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { BouncePressable } from "@/components/BouncePressable";
import { ScreenBackground } from "@/components/ScreenBackground";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useI18n } from "@/core/i18n/I18nContext";
import { getProviderCredentials, saveProviderCredentials } from "@/core/storage/secureCredentials";
import { Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, themeColors, useThemeRerender } from "@/core/theme/themedStyles";
import { generateId } from "@/core/utils/id";
import { getProviderById, insertProvider, setActiveProvider, updateProvider } from "@/db/repositories/providerRepository";
import type { Provider } from "@/domain/provider/types";
import {
  authenticate,
  normalizeBaseUrl,
  resolveContainerExtension,
} from "@/providers/xtream/xtreamAdapter";
import { resolveServerShortcode } from "@/providers/serverShortcodes";
import { MASKED_VALUE } from "@/core/storage/maskedValue";
import { PreparingLibrary } from "@/components/PreparingLibrary";
import { clearCatalogCache } from "@/db/repositories/catalogCacheRepository";
import { preloadCatalog, type PreloadProgress } from "@/state/catalogCache";
import { getActiveSession, setActiveSession } from "@/state/activeSessionStore";
import { resetSearchIndex } from "@/state/searchIndexStore";
import { setSeriesList } from "@/state/seriesStore";
import { setVodMovies } from "@/state/vodStore";

export default function AddProviderScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const { providerId } = useLocalSearchParams<{ providerId?: string }>();
  const isEdit = Boolean(providerId);

  const [name, setName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  /** Non-null only while the one-time catalog download for this provider runs. */
  const [preload, setPreload] = useState<PreloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  /**
   * What is already saved for the provider being edited.
   *
   * A ref, not state, and never written into the three inputs: the point of
   * the whole arrangement is that a saved credential does not reach the
   * screen. Read only at submit time, to fill in whichever fields the
   * viewer left alone.
   */
  const storedRef = useRef<{ baseUrl: string; username: string; password: string } | null>(null);

  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    (async () => {
      const [provider, credentials] = await Promise.all([
        getProviderById(providerId),
        getProviderCredentials(providerId),
      ]);
      if (cancelled) return;
      /*
        Only the name is put on screen — it is a label the viewer chose, not
        a credential. The server, username and password are held in a ref
        and the three inputs stay empty, showing MASKED_VALUE as a
        placeholder that means "saved; leave it or replace it".

        This is what makes the fields uncopyable without relying on any
        platform setting: there is nothing in them to copy.
      */
      if (provider) setName(provider.name);
      storedRef.current = {
        baseUrl: provider?.baseUrl ?? "",
        username: credentials?.username ?? "",
        password: credentials?.password ?? "",
      };
      setLoadingExisting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  /**
   * Adding needs all three typed. Editing needs none of them: a blank field
   * means "keep what is saved", so Save has to stay available even when the
   * viewer only came to change the name — or came, looked, and changed
   * nothing.
   */
  const canSubmit = isEdit
    ? !loadingExisting
    : serverUrl.trim().length > 0 && username.trim().length > 0 && password.length > 0;

  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  async function handleSubmit() {
    if (!canSubmit || isConnecting) return;
    setIsConnecting(true);
    setErrorMessage(null);

    /*
      A field left blank keeps whatever is already saved. Compared after
      trimming, so a stray space in a field the viewer did not mean to touch
      counts as untouched rather than wiping a working address.

      `storedRef` is null when adding, which makes the fallbacks empty
      strings — and `canSubmit` has already required all three in that case.
    */
    const stored = storedRef.current;
    const typedUrl = serverUrl.trim();
    const typedUsername = username.trim();
    const effectiveUrl = typedUrl || stored?.baseUrl || "";
    const effectiveUsername = typedUsername || stored?.username || "";
    const effectivePassword = password || stored?.password || "";

    // A shortcut such as "22" expands to its full address here; anything
    // else passes through untouched. Resolved before normalising, so what
    // gets stored is a real URL and nothing downstream sees a shortcut.
    const baseUrl = normalizeBaseUrl(resolveServerShortcode(effectiveUrl));
    const config = {
      kind: "xtream" as const,
      baseUrl,
      username: effectiveUsername,
      password: effectivePassword,
    };

    try {
      const { allowedOutputFormats, accountInfo } = await authenticate(config);
      const containerExtension = resolveContainerExtension(allowedOutputFormats);

      /*
        Everything the provider offers is downloaded once, here, and written
        to the device — so this is the only moment the user ever waits on a
        catalog. A provider being edited may point somewhere new, so its
        stored catalog is discarded first rather than mixed with the new
        one.
      */
      const targetId = isEdit && providerId ? providerId : generateId();
      if (isEdit && providerId) await clearCatalogCache(providerId);

      const snapshot = await preloadCatalog(targetId, config, containerExtension, setPreload);
      const channels = snapshot.channels;
      if (channels.length === 0) {
        setErrorMessage(t("addProvider", "noVodEmpty"));
        return;
      }

      /*
        A neutral fallback, never the host.

        This used to be the server address, which quietly undid the masking
        everywhere else: a viewer who left the name blank ended up with
        the server's own address printed as their provider's name in the list
        and in Settings, in bold, while the field it came from was masked.
      */
      const hostLabel = t("addProvider", "defaultName");
      const now = Date.now();

      if (isEdit && providerId) {
        const updated: Pick<Provider, "id" | "name" | "baseUrl"> = {
          id: providerId,
          name: name.trim() || hostLabel,
          baseUrl,
        };
        await updateProvider(updated);
        await saveProviderCredentials(providerId, { username: config.username, password: config.password });

        /*
         * Only when the edited provider is the one currently in session.
         * Unconditionally, this replaced the live session's catalog with the
         * edited provider's: Home showed B's movies while A's credentials
         * were still in play, so opening one built a stream URL from A's
         * account and B's ids — the wrong title, or a 404.
         */
        const activeSession = getActiveSession();
        if (activeSession?.provider.id === providerId) {
          setVodMovies(snapshot.movies);
          setSeriesList(snapshot.series);
          resetSearchIndex();
          setActiveSession({
            provider: { ...activeSession.provider, ...updated, lastConnectedAt: now },
            config,
            channels,
            accountInfo,
          });
        }
        router.back();
        return;
      }

      const provider: Provider = {
        id: targetId,
        kind: "xtream",
        name: name.trim() || hostLabel,
        baseUrl,
        isActive: true,
        createdAt: now,
        lastConnectedAt: now,
      };

      await saveProviderCredentials(provider.id, { username: config.username, password: config.password });
      await insertProvider(provider);
      await setActiveProvider(provider.id);
      setActiveSession({ provider, config, channels, accountInfo });
      setVodMovies(snapshot.movies);
      setSeriesList(snapshot.series);

      router.replace("/home");
    } catch (error) {
      // On this screen the address was just typed, so the actionable
      // fallback names it — elsewhere the URL is already known-good and
      // "the server isn't answering" is the honest wording.
      setErrorMessage(toUserFacingMessage(error, t("addProvider", "unreachable")));
    } finally {
      setIsConnecting(false);
      setPreload(null);
    }
  }

  if (preload) {
    return <PreparingLibrary progress={preload} />;
  }

  if (loadingExisting) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centered}>
            <ActivityIndicator color={Brand.primary} />
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground particles>
      {/*
        The window does not resize for the on-screen keyboard in this app.
        `edgeToEdgeEnabled` is on in the generated build, and enabling it
        calls `setDecorFitsSystemWindows(window, false)`, which stops
        `adjustResize` in the manifest from having any effect — nothing in
        the stack then pads for the IME, so the keyboard simply covered the
        fields and the `paddingBottom` below only made the content longer.

        `KeyboardAvoidingView` pads from the `keyboardDidShow` event instead
        of relying on the window, which works either way; the ScrollView
        then shrinks and Android scrolls the focused field into view on its
        own. It has to be the outermost full-height element, because it
        measures its own frame against the keyboard's top edge.
      */}
      <KeyboardAvoidingView style={styles.keyboardAvoider} behavior="padding">
      <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, keyboardOpen && styles.scrollContentKeyboardOpen]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <BouncePressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </BouncePressable>
        </View>

        <Animated.Text entering={FadeInDown.duration(500)} style={styles.title}>
          {isEdit ? t("addProvider", "editTitle") : t("addProvider", "title")}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(80).duration(500)} style={styles.subtitle}>
          {t("addProvider", "subtitle")}
        </Animated.Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t("addProvider", "nameLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("addProvider", "namePlaceholder")}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("addProvider", "serverUrlLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={isEdit ? MASKED_VALUE : t("addProvider", "serverUrlPlaceholder")}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            /*
              Kills the long-press Copy/Paste/Select-all menu. Belt and
              braces rather than the defence itself — the field is empty
              while editing, so there is nothing in it to copy. It also
              stops a paste landing in a field the viewer meant to leave
              alone, which would silently overwrite a working address.
            */
            contextMenuHidden
            value={serverUrl}
            onChangeText={setServerUrl}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("addProvider", "usernameLabel")}</Text>
          <TextInput
            style={styles.input}
            placeholder={isEdit ? MASKED_VALUE : undefined}
            placeholderTextColor={themeColors().textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            contextMenuHidden
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("addProvider", "passwordLabel")}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder={isEdit ? MASKED_VALUE : undefined}
              placeholderTextColor={themeColors().textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              contextMenuHidden
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
            />
            <Focusable
              onPress={() => setPasswordVisible((v) => !v)}
              style={styles.toggleButton}
              hitSlop={8}
            >
              <Text style={styles.toggleButtonText}>
                {passwordVisible ? t("addProvider", "hide") : t("addProvider", "show")}
              </Text>
            </Focusable>
          </View>
        </View>

        {errorMessage && (
          <Animated.Text entering={FadeIn.duration(300)} style={styles.error}>
            {errorMessage}
          </Animated.Text>
        )}

        <BouncePressable
          onPress={handleSubmit}
          disabled={!canSubmit || isConnecting}
          style={[styles.connectButton, (!canSubmit || isConnecting) && styles.connectButtonDisabled]}
        >
          {isConnecting ? (
            <ActivityIndicator color={themeColors().onAccent} />
          ) : (
            <Text style={styles.connectButtonText}>
              {isEdit ? t("addProvider", "saveButton") : t("addProvider", "connectButton")}
            </Text>
          )}
        </BouncePressable>
      </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: {
    padding: Spacing.xl,
    gap: Spacing.lg,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  /**
   * Slack under the last field, added only while the keyboard is up. The
   * password input and the connect button are the final elements on the
   * form, so with the keyboard open there was nothing below them for the
   * scroll view to travel into — the focused field simply could not be
   * brought above the keyboard, whatever the platform tried. This is dead
   * space that would look wrong with the keyboard closed, hence the toggle.
   */
  keyboardAvoider: { flex: 1 },
  /* Kept small: KeyboardAvoidingView now supplies the real inset. */
  scrollContentKeyboardOpen: { paddingBottom: Spacing.xxl },
  topBar: { flexDirection: "row" },
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
  title: { color: C.text, fontSize: 22, fontFamily: FontFamily.extraBold },
  subtitle: {
    color: C.textSecondary,
    fontSize: 14,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.sm,
  },
  field: { gap: Spacing.xs },
  label: { color: C.textSecondary, fontSize: 13, fontFamily: FontFamily.semiBold },
  input: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: C.text,
    fontSize: 15,
    fontFamily: FontFamily.regular,
  },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1 },
  toggleButton: { position: "absolute", end: Spacing.lg },
  toggleButtonText: { color: Brand.primaryLight, fontSize: 13, fontFamily: FontFamily.semiBold },
  error: { color: C.error, fontSize: 13, fontFamily: FontFamily.regular },
  connectButton: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.md,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  connectButtonDisabled: { opacity: 0.5 },
  connectButtonText: { color: C.onAccent, fontSize: 15, fontFamily: FontFamily.bold },
  })
);
