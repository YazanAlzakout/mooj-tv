import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * Whether this build offers downloads at all.
 *
 * It does not on Android TV. A set-top box or a television typically has
 * 8-16 GB of storage shared with the system, which one film can take a
 * quarter of, and there is no practical way for a viewer to manage files
 * from the couch — so the feature is absent rather than present and
 * frustrating. Everything downstream keys off this, which is why the
 * buttons, the Downloads screen entry points and the boot-time recovery
 * all disappear together instead of leaving dead ends behind.
 *
 * Keyed to the build, not to `Platform.isTV` — see isTvBuild.ts. The
 * runtime check reported `false` on the test box, so the TV build was
 * offering downloads on a television after all.
 */
export function downloadsSupported(): boolean {
  return !isTvBuild;
}

/**
 * Master prompt §27: only direct-file VOD is downloadable. `.m3u8` is a
 * playlist, not a single file, and live streams are never offered a
 * download action in the UI at all (no eligibility check needed for them).
 */
export function isDownloadEligible(containerExtension: string): boolean {
  if (!downloadsSupported()) return false;
  return containerExtension.trim().toLowerCase() !== "m3u8";
}
