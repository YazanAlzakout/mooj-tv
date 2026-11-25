import { Platform } from "react-native";

/**
 * Containers AVPlayer can open.
 *
 * On iPhone, films and episodes play through expo-video, which is AVPlayer;
 * libVLC is wired up for live TV only (see docs/IOS_READINESS.md). AVPlayer
 * cannot open Matroska, AVI, WebM or a progressive MPEG-TS file at all.
 */
const AVPLAYER_CONTAINERS = new Set(["mp4", "m4v", "mov", "m3u8"]);

/**
 * True when this file cannot play on this device, known before opening it.
 *
 * Without this, a title in such a container opened a stream — one of the
 * account's three connections — failed, retried once, and ended on "This
 * title will not play right now. Try again in a moment.", which is false:
 * trying again changes nothing. That was the series episode on the first
 * iPhone build (2026-11-24). Now the screen says what is actually true
 * (`vodUnsupported`) and opens nothing.
 *
 * An unknown or empty extension is not blocked: the panel sometimes leaves
 * the field empty, and refusing those would refuse files that play. The real
 * fix is a libVLC path for films and episodes on iOS — on branch
 * `ios-vod-vlc` such titles play through it (vodVlcEngine.ios.tsx) instead.
 */
export function unplayableOnIos(containerExtension: string | null | undefined): boolean {
  if (Platform.OS !== "ios") return false;
  const ext = (containerExtension ?? "").trim().toLowerCase();
  if (!ext) return false;
  return !AVPLAYER_CONTAINERS.has(ext);
}
