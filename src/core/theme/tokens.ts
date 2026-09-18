import { Platform } from "react-native";

/**
 * Shared design tokens. Colors and the accent are carried over from the
 * live ALBASERA brand (see docs/DECISIONS.md) — dark-first, one red accent,
 * no screen-for-screen copying of the old app's layouts.
 */

/**
 * Spread into a `Text` style whenever it sits inside a *fixed-height* pill,
 * chip, or button (a category tab, a badge, a small toggle) — anywhere a
 * single line of text must sit precisely centered in a box shorter than a
 * full paragraph's breathing room.
 *
 * Noto Kufi Arabic — this app's only font — carries unusually tall
 * ascent/descent metrics in its own font tables, taller than an ordinary
 * Latin face at the same `fontSize`. On Android, RN's default text
 * rendering (`includeFontPadding: true`) reserves extra vertical space
 * based on exactly those metrics, so even a deliberately generous
 * `lineHeight` on a fixed-height container was still clipping the top of
 * Arabic labels — confirmed recurring on three separate tab strips built
 * at three different times, each with its own `lineHeight` fix, each still
 * clipping. `includeFontPadding: false` removes Android's reserved
 * padding outright instead of guessing a `lineHeight` large enough to
 * outrun it; `textAlignVertical: "center"` is its required pairing to keep
 * the (now unpadded) glyph centered rather than pinned to the top. Both
 * are Android-only properties — a no-op object on iOS/web, where this
 * class of clipping does not occur.
 */
export const AndroidTextFix =
  Platform.OS === "android"
    ? ({ includeFontPadding: false, textAlignVertical: "center" } as const)
    : ({} as const);

export const Brand = {
  primary: "#E50914",
  primaryDark: "#B20710",
  primaryLight: "#FF2D3A",
  primaryGlow: "rgba(229, 9, 20, 0.35)",
  primaryMuted: "rgba(229, 9, 20, 0.15)",
  focus: "#00F2FF",
} as const;

export const Colors = {
  background: "#0A0A0F",
  surface: "#12121A",
  surfaceElevated: "#1C1C28",
  border: "rgba(255,255,255,0.08)",
  text: "#F9FAFB",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  overlay: "rgba(0,0,0,0.6)",
  success: "#22C55E",
  error: "#FF8A8A",
} as const;

/**
 * Solid category accents (not gradients — expo-linear-gradient needs a
 * native rebuild we're not blocking on right now; see docs/DECISIONS.md).
 */
export const CategoryColors = {
  live: Brand.primary,
  movies: "#6D28D9",
  series: "#DB2777",
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Registered in src/app/_layout.tsx from assets/fonts/NotoKufiArabic-*.ttf. */
export const FontFamily = {
  light: "NotoKufiArabic-Light",
  regular: "NotoKufiArabic-Regular",
  medium: "NotoKufiArabic-Medium",
  semiBold: "NotoKufiArabic-SemiBold",
  bold: "NotoKufiArabic-Bold",
  extraBold: "NotoKufiArabic-ExtraBold",
  black: "NotoKufiArabic-Black",
} as const;

export const TVSafeArea = {
  horizontal: 96,
  vertical: 48,
} as const;

/**
 * The tile a channel logo sits on, the same dark in both themes.
 *
 * Channel artwork comes from the provider and is overwhelmingly **white**:
 * a white wordmark or a white glyph on transparency, drawn for the black
 * background of a set-top box. On the dark theme that is invisible by
 * luck — the surface behind it is `#12121A`. On the light theme the
 * surface is `#F3F4F6`, and a white logo on near-white is nothing at all.
 * Whole categories looked like a grid of empty boxes.
 *
 * So the tile does not follow the theme. It is the one surface in the app
 * that is decided by what goes on it rather than by the palette, and the
 * alternative — forcing the whole app dark on the television, which is
 * what was first considered — throws away a setting the viewer chose in
 * order to fix one background.
 *
 * Slightly lifted from `Colors.surface` so the tile still reads as a tile
 * on the dark theme rather than merging into the page.
 */
export const ArtworkTile = {
  background: "#16161F",
  border: "rgba(255,255,255,0.10)",
} as const;
