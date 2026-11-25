import * as ScreenOrientation from "expo-screen-orientation";
import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { isTvBuild } from "@/core/platform/isTvBuild";

/**
 * How long a release waits before it takes effect.
 *
 * Moving to the next episode unmounts one player screen and mounts another,
 * and for a moment neither holds the lock. That moment was visible: the
 * picture dropped to portrait and snapped back to landscape on every Next
 * ("عند الضغط على التالي في المشغل تقوم الشاشة بوضع عامودي ثم افقي",
 * 2026-09-16). Holding the release for a beat lets the incoming screen claim
 * the lock first, and its claim cancels the release outright.
 *
 * Short enough that genuinely leaving the player still feels immediate.
 */
const RELEASE_GRACE_MS = 400;

/**
 * The pending release, shared by every instance of this hook.
 *
 * Module scope is the point: the screen being unmounted and the screen being
 * mounted are different components, so the only way one can cancel the
 * other's work is through something neither of them owns.
 */
let pendingRelease: ReturnType<typeof setTimeout> | null = null;

function cancelPendingRelease(): void {
  if (pendingRelease === null) return;
  clearTimeout(pendingRelease);
  pendingRelease = null;
}

/**
 * Master prompt §24.8: phone playback enters landscape for fullscreen and
 * restores prior orientation on exit, but must never fight tablet/TV
 * orientation. The build flag gates this to phone only — a TV app is
 * already landscape at the OS/launcher level and has no portrait state to
 * restore.
 *
 * It gated on `Platform.isTV` until 2026-09-10, which reports `false` on
 * the test box: the television was therefore calling
 * `setRequestedOrientation(LANDSCAPE)` on entering every player. On Android
 * that is a configuration change, and a configuration change recreates the
 * activity — so the one moment that had to be smooth was instead a full
 * teardown and rebuild of the screen. See isTvBuild.ts.
 *
 * `enabled` exists for the split channel layout, where the video is a box
 * at the top of a portrait page: forcing landscape there would turn the
 * list underneath on its side for no reason. Passing `false` releases the
 * lock without unmounting the player.
 *
 * ## Handing the lock from one screen to the next
 *
 * Releases are deferred and cancellable — see `RELEASE_GRACE_MS`. A lock
 * always cancels a pending release before taking effect, so a screen that
 * replaces another inherits the lock with no gap, while leaving the player
 * altogether still frees the orientation a moment later.
 */
export function useFullscreenOrientation(enabled = true): void {
  const navigation = useNavigation();

  useEffect(() => {
    if (isTvBuild) return;

    if (!enabled) {
      cancelPendingRelease();
      ScreenOrientation.unlockAsync().catch(() => {});
      return;
    }

    cancelPendingRelease();
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});

    return () => {
      cancelPendingRelease();
      pendingRelease = setTimeout(() => {
        pendingRelease = null;
        ScreenOrientation.unlockAsync().catch(() => {});
      }, RELEASE_GRACE_MS);
    };
  }, [enabled]);

  /**
   * iPhone: turn the window upright the moment the viewer leaves.
   *
   * The release above lands 400 ms after the player has unmounted, and on
   * iOS `unlockAsync` does not rotate anything back — it only lets the
   * sensor decide again. So the page underneath was revealed while the
   * window was still landscape, and on the first iPhone build (2026-11-24)
   * the details page showed sideways for most of a second every time a
   * player was closed.
   *
   * `beforeRemove` fires for the back button and for the swipe. A
   * `REPLACE` (the next episode taking this player's place) is left alone:
   * the incoming screen claims landscape itself, and turning upright here
   * would bring back the portrait flash `RELEASE_GRACE_MS` exists to stop.
   * The deferred unlock still follows, so rotation is free again afterwards.
   * Android keeps its existing behaviour.
   */
  useEffect(() => {
    if (isTvBuild || !enabled || Platform.OS !== "ios") return;
    return navigation.addListener("beforeRemove", (event) => {
      /*
        Only a player-to-player replace hands the lock on. Leaving for good
        can also be a replace - a lost session sends the viewer to
        /providers with router.replace - and that one must turn upright too.
      */
      const target = JSON.stringify(event.data.action.payload ?? {});
      if (event.data.action.type === "REPLACE" && target.includes("/player/")) return;
      cancelPendingRelease();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    });
  }, [navigation, enabled]);
}
