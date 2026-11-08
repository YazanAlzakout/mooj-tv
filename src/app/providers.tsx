import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { Focusable } from "@/components/Focusable";
import { BouncePressable } from "@/components/BouncePressable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ScreenBackground } from "@/components/ScreenBackground";
import { toUserFacingMessage } from "@/core/errors/providerErrorMessage";
import { useI18n } from "@/core/i18n/I18nContext";
import { deleteProviderCredentials } from "@/core/storage/secureCredentials";
import { AndroidTextFix, Brand, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import { brandLogoSource } from "@/components/BrandLogo";
import { LogoRipple } from "@/components/LogoRipple";
import type { ThemeColors } from "@/core/theme/palettes";
import { themedStyles, useThemeRerender } from "@/core/theme/themedStyles";
import { deleteProvider, listProviders, setActiveProvider } from "@/db/repositories/providerRepository";
import type { Provider } from "@/domain/provider/types";
import { clearActiveSession, getActiveSession } from "@/state/activeSessionStore";
import { MASKED_VALUE } from "@/core/storage/maskedValue";
import { restoreSession } from "@/state/sessionRestore";

function formatLastConnected(t: ReturnType<typeof useI18n>["t"], timestamp: number | null): string {
  if (timestamp === null) return t("providers", "neverConnected");
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("common", "justNow");
  if (minutes < 60) return t("common", "minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common", "hoursAgo", { n: hours });
  return t("common", "daysAgo", { n: Math.floor(hours / 24) });
}

export default function ProvidersScreen() {
  // Repaints this screen — and everything it renders — when the theme changes.
  useThemeRerender();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Provider | null>(null);

  const reload = useCallback(() => {
    /*
      The empty list on failure is deliberate, and it is this app's only
      escape hatch.

      `providers === null` renders a bare spinner with no text and no retry,
      and this screen is where the startup sequence sends anyone whose
      routing could not be decided. `getDatabase()` memoises its promise,
      a rejected one included, so a database that fails to open once fails
      for the life of the process — leaving that spinner on screen on every
      launch, for ever, with nothing to press. An empty list at least draws
      the "add a provider" screen, which is somewhere a person can act from.
    */
    listProviders().then(setProviders, () => setProviders([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function handleSelect(provider: Provider) {
    if (busyId) return;
    if (provider.isActive && getActiveSession()?.provider.id === provider.id) {
      router.replace("/home");
      return;
    }
    setBusyId(provider.id);
    setErrorMessage(null);
    try {
      await restoreSession(provider);
      /*
       * Persist the choice, not just the in-memory session. Without this the
       * `providers.is_active` flag stayed on whichever provider was added
       * last, so the next launch silently restored *that* one — the user
       * connected to B, used it, reopened the app and was back on A — and
       * the list kept its "Active" dot on the wrong row.
       */
      await setActiveProvider(provider.id);
      /*
       * Same reason as Settings' disconnect: reached from Settings, a plain
       * `replace` would leave the previous provider's Home in the stack,
       * and two backs would land on it — its header describing provider A
       * over provider B's catalogue.
       */
      router.dismissAll();
      router.replace("/home");
    } catch (error) {
      // The same translated wording every other screen uses; the raw message
      // is a transport detail ("HTTP 404 from http://…"), not something to show.
      setErrorMessage(toUserFacingMessage(error, t("providers", "connectError")));
      reload();
    } finally {
      setBusyId(null);
    }
  }

  function handleEdit(provider: Provider) {
    router.push({ pathname: "/add-provider", params: { providerId: provider.id } });
  }

  async function performDelete(provider: Provider) {
    await deleteProvider(provider.id);
    await deleteProviderCredentials(provider.id);
    if (getActiveSession()?.provider.id === provider.id) {
      clearActiveSession();
    }
    reload();
  }

  if (providers === null) {
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
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.duration(500)} style={styles.brand}>
            <LogoRipple size={isLandscape ? 120 : 200}>
              <View style={[styles.logoWrap, isLandscape && styles.logoWrapLandscape]}>
                <Image
                  source={brandLogoSource()}
                  style={[styles.logo, isLandscape && styles.logoLandscape]}
                  resizeMode="contain"
                />
              </View>
            </LogoRipple>
            <Text style={styles.tagline}>{t("providers", "tagline")}</Text>
          </Animated.View>

          {/*
            The providers live inside one bordered panel with its own header
            rather than as bare rows on the page background: the grouping is
            what makes the screen read as designed instead of as a list
            dropped onto a backdrop, and it gives the "add" action a natural
            home next to the count it affects.
          */}
          <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>{t("providers", "title")}</Text>
                {providers.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{providers.length}</Text>
                  </View>
                )}
              </View>
              <BouncePressable style={styles.addChip} onPress={() => router.push("/add-provider")}>
                <Text style={styles.addChipText}>{t("providers", "addProvider")}</Text>
              </BouncePressable>
            </View>

            {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

            {providers.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIconText}>▭</Text>
                <Text style={styles.emptyText}>{t("providers", "noProvidersYet")}</Text>
              </View>
            ) : (
              <View style={styles.providerList}>
                {/*
                  `.map`, not a FlatList: this sits inside a ScrollView (a
                  nested virtualised list is a documented RN anti-pattern),
                  and a saved-provider list is a handful of rows — there is
                  nothing here to virtualise.
                */}
                {providers.map((item, index) => (
                  <Animated.View key={item.id} entering={FadeInDown.delay(index * 60).duration(400)}>
                    <ProviderCard
                      provider={item}
                      isBusy={busyId === item.id}
                      disabled={busyId !== null}
                      onSelect={() => handleSelect(item)}
                      onEdit={() => handleEdit(item)}
                      onDelete={() => setPendingDelete(item)}
                      t={t}
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={t("providers", "removeTitle")}
        message={t("providers", "removeBody", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("common", "remove")}
        danger
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) await performDelete(target);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenBackground>
  );
}

function ProviderCard({
  provider,
  isBusy,
  disabled,
  onSelect,
  onEdit,
  onDelete,
  t,
}: {
  provider: Provider;
  isBusy: boolean;
  disabled: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <View style={[styles.row, provider.isActive && styles.rowActive]}>
      {provider.isActive && (
        <View style={styles.activeBadge}>
          <View style={styles.activeDot} />
        </View>
      )}
      <BouncePressable style={styles.rowMainTouchable} onPress={onSelect} disabled={disabled}>
        <View style={styles.rowMain}>
          <View style={[styles.iconWrap, provider.isActive && styles.iconWrapActive]}>
            <Text style={styles.iconText}>{provider.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.rowTextCol}>
            <Text style={styles.rowName} numberOfLines={1}>
              {provider.name}
            </Text>
            {/* Masked for the same reason as the Settings card. */}
            <Text style={styles.rowHost} numberOfLines={1}>
              {MASKED_VALUE}
            </Text>
            <Text style={styles.rowMeta}>{formatLastConnected(t, provider.lastConnectedAt)}</Text>
          </View>
        </View>
      </BouncePressable>

      {/*
        The card was already tappable as a whole, and stays so — but tapping
        a row to connect is a convention people have to be told about, and
        nothing on screen said it. A filled button states the action
        outright; the row itself remains a shortcut for anyone who found it.
      */}
      <View style={styles.rowActions}>
        {isBusy ? (
          <ActivityIndicator color={Brand.primary} style={styles.busyIndicator} />
        ) : (
          <BouncePressable style={styles.connectButton} onPress={onSelect} disabled={disabled}>
            <Text style={styles.connectButtonText} numberOfLines={1}>
              {t("providers", "connect")}
            </Text>
          </BouncePressable>
        )}
        <Focusable onPress={onEdit} hitSlop={10} disabled={disabled} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>{t("providers", "edit")}</Text>
        </Focusable>
        <Focusable onPress={onDelete} hitSlop={10} disabled={disabled} style={styles.actionButton}>
          <Text style={styles.deleteButtonText}>{t("common", "remove")}</Text>
        </Focusable>
      </View>
    </View>
  );
}

const styles = themedStyles((C: ThemeColors) =>
  StyleSheet.create({
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.lg, padding: Spacing.xl },

  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  brand: { alignItems: "center", paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.sm },
  /**
   * No plate behind the mark.
   *
   * There was one: a 200dp rounded square filled with `fillSubtle`, so the
   * logo would have "a defined edge on a dark, particle-lit background
   * instead of letting it dissolve into it". That was written for the
   * previous brand, whose mark was lettering — thin white strokes that
   * genuinely do dissolve into a dark page and need something behind them.
   *
   * Mooj's mark is a self-lit sphere with its own gradient and its own
   * dark rim. It has the edge the plate was there to give it, so all the
   * plate did was put a visibly lighter square behind a circle, which is
   * what it looks like on a device: a mistake. The wrapper stays for the
   * sizing and the landscape case; only the fill goes.
   */
  logoWrap: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Landscape has roughly half the height — the mark shrinks so the list still gets room. */
  logoWrapLandscape: { width: 120, height: 120 },
  logo: { width: 190, height: 190 },
  logoLandscape: { width: 112, height: 112 },
  tagline: {
    color: C.textMuted,
    fontSize: 13,
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    textAlign: "center",
    ...AndroidTextFix,
  },

  section: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.xl,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  sectionTitle: {
    color: C.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: Brand.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { color: "#fff", fontSize: 12, fontFamily: FontFamily.bold },
  addChip: {
    backgroundColor: Brand.primary,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  addChipText: { color: "#fff", fontSize: 13, lineHeight: 22, fontFamily: FontFamily.bold, ...AndroidTextFix },

  providerList: { gap: Spacing.sm },

  error: {
    color: C.error,
    fontSize: 13,
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    marginBottom: Spacing.sm,
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xxl,
    borderRadius: Radii.lg,
    backgroundColor: C.surfaceElevated,
  },
  emptyIconText: { color: C.fillMedium, fontSize: 34 },
  emptyText: { color: C.textMuted, fontSize: 13, lineHeight: 22, fontFamily: FontFamily.regular },

  /**
   * A column, not a row: the connect button sits under the provider's
   * details rather than beside them, so it gets the full width of the card
   * and reads as the card's primary action instead of as a third small
   * control competing with edit and remove.
   */
  row: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: Radii.lg,
    overflow: "hidden",
  },
  rowActive: { borderColor: Brand.primary, backgroundColor: Brand.primaryMuted },
  rowMainTouchable: { alignSelf: "stretch" },
  rowMain: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.lg },
  activeBadge: { position: "absolute", top: Spacing.sm, end: Spacing.sm, zIndex: 1 },
  activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Brand.primary },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: C.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: Brand.primaryMuted },
  iconText: { color: C.textSecondary, fontSize: 18, fontFamily: FontFamily.extraBold },
  rowTextCol: { flex: 1, gap: 2 },
  rowName: { color: C.text, fontSize: 15, fontFamily: FontFamily.bold },
  rowHost: { color: C.textSecondary, fontSize: 12, fontFamily: FontFamily.regular },
  rowMeta: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.regular },

  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  /**
   * `minHeight`, never a fixed height — a mixed Arabic/Latin label measures
   * a taller line box than a plain-Arabic one, and a fixed height can only
   * clip that (docs/DECISIONS.md).
   */
  connectButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radii.md,
    backgroundColor: Brand.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  connectButtonText: {
    color: C.onAccent,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: FontFamily.bold,
    ...AndroidTextFix,
  },
  /** Occupies the button's slot while connecting, so the row does not jump. */
  busyIndicator: { flex: 1, minHeight: 40 },
  actionButton: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  actionButtonText: { color: Brand.primaryLight, fontSize: 12, fontFamily: FontFamily.semiBold },
  deleteButtonText: { color: C.error, fontSize: 12, fontFamily: FontFamily.semiBold },
  })
);
