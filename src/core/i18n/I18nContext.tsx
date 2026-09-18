import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, BackHandler, I18nManager } from "react-native";

import { getAppState, setLanguage as persistLanguage } from "@/db/repositories/appStateRepository";

import { DEFAULT_LOCALE, isSupportedLocale, localeMeta, type LocaleCode } from "./locales";
import ar from "./translations/ar";
import ckb from "./translations/ckb";
import en, { type TranslationShape } from "./translations/en";
import fr from "./translations/fr";
import ku from "./translations/ku";
import tr from "./translations/tr";

const TRANSLATIONS: Record<LocaleCode, TranslationShape> = { en, ar, fr, tr, ckb, ku };

type Namespace = keyof TranslationShape;
type TFunction = <N extends Namespace>(
  namespace: N,
  key: keyof TranslationShape[N],
  params?: Record<string, string | number>
) => string;

interface I18nContextValue {
  locale: LocaleCode;
  isRTL: boolean;
  setLocale: (code: LocaleCode) => Promise<void>;
  t: TFunction;
  /**
   * The full raw translation table for the current locale — an escape
   * hatch for content `t()` can't serve, since `t()` is string-only
   * (`translate()` always calls `interpolate()`, which requires a string).
   * Needed for structured content like the legal screen's sectioned terms
   * (an array of `{heading, body: string[]}` per section), which has no
   * sane flat-key representation.
   */
  strings: TranslationShape;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectDeviceLocale(): LocaleCode {
  for (const l of getLocales()) {
    if (isSupportedLocale(l.languageCode ?? "")) return l.languageCode as LocaleCode;
  }
  return DEFAULT_LOCALE;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

function translate<N extends Namespace>(
  locale: LocaleCode,
  namespace: N,
  key: keyof TranslationShape[N],
  params?: Record<string, string | number>
): string {
  const table = TRANSLATIONS[locale] ?? en;
  const nsTable = table[namespace] as Record<string, string>;
  const raw = nsTable[key as string] ?? (en[namespace] as Record<string, string>)[key as string];
  return interpolate(raw, params);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);

  useEffect(() => {
    getAppState().then((state) => {
      const resolved = state.language && isSupportedLocale(state.language) ? state.language : detectDeviceLocale();
      setLocaleState(resolved);
      if (!state.language) persistLanguage(resolved).catch(() => {});
    });
  }, []);

  const isRTL = localeMeta(locale).isRTL;

  async function setLocale(code: LocaleCode) {
    const willBeRTL = localeMeta(code).isRTL;
    await persistLanguage(code);
    setLocaleState(code);

    if (isRTL !== willBeRTL) {
      I18nManager.allowRTL(willBeRTL);
      I18nManager.forceRTL(willBeRTL);
      /*
       * Two buttons, and the app only closes if the user picks the one that
       * says so. Before this it was a single "Restart now" button that quit
       * immediately — from a viewer's side, changing a setting made the app
       * vanish, which reads as a crash rather than as a restart.
       *
       * "Later" is honest rather than broken: the new language is already
       * applied and persisted; only the right-to-left *layout* waits for the
       * next launch, which is a native constraint (`I18nManager.forceRTL`
       * takes effect when the activity is recreated), not a choice.
       */
      const strings = TRANSLATIONS[code];
      Alert.alert(strings.settings.restartRequiredTitle, strings.settings.restartRequiredBody, [
        { text: strings.common.later, style: "cancel" },
        { text: strings.settings.restartNow, onPress: () => BackHandler.exitApp() },
      ]);
    }
  }

  const value = useMemo<I18nContextValue>(() => {
    const t: TFunction = (namespace, key, params) => translate(locale, namespace, key, params);
    const strings = TRANSLATIONS[locale] ?? en;
    return { locale, isRTL, setLocale, t, strings };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setLocale is stable (no external deps captured).
  }, [locale, isRTL]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
