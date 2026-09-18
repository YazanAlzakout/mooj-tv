import type { ImageSourcePropType } from "react-native";

import { getActiveTheme } from "@/core/theme/themedStyles";

const NIGHT = require("../../assets/images/logo-night.png") as ImageSourcePropType;
const DAY = require("../../assets/images/logo.png") as ImageSourcePropType;

/**
 * The wordmark, in the ink that shows against the current theme.
 *
 * `logo-night.png` is drawn in white for a dark background; `logo.png` is
 * the same mark in near-black for a light one. Every screen used to hard-
 * code the night version, which meant a white logo on a white page the
 * moment light mode existed.
 *
 * A plain function rather than a component: these are `<Image>` and
 * `<Animated.Image>` call sites with their own styles and entrance
 * animations, and only the `source` differs between them. Reading the
 * active theme here is safe during render — it is a module variable, and
 * the whole tree is rebuilt when it changes.
 */
export function brandLogoSource(): ImageSourcePropType {
  return getActiveTheme() === "light" ? DAY : NIGHT;
}

/**
 * The white wordmark, whatever the theme is.
 *
 * For surfaces that are black regardless of the app's palette — the video
 * players and the message drawn over a stopped stream. `brandLogoSource()`
 * would hand those the near-black mark in light mode, which is invisible
 * there.
 */
export function brandLogoOnDark(): ImageSourcePropType {
  return NIGHT;
}
