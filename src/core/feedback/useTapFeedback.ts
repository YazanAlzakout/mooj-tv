import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";

/**
 * The tick and the tap the app answers a press with.
 *
 * It started inside the bottom tab bar and belongs to more than the tab
 * bar: a menu of six destinations and a settings screen of switches are
 * the same gesture, and answering it on one screen and not the next is
 * worse than never answering it at all. So the sound lives here and the
 * screens that press-and-go call it.
 *
 * ## The level is in the file, not here
 *
 * Setting `player.volume` would be the obvious way and the React Compiler
 * refuses it: anything a hook hands back is frozen, in an effect as much
 * as in render. So the asset itself is mixed down — about 15 dB below
 * where it arrived, after two rounds of "quieter" — which is where it
 * needed to be anyway. A tick you notice is a tick that is too loud, and
 * this one fires several times a minute.
 *
 * ## One player per screen, re-fired rather than re-made
 *
 * `useAudioPlayer` loads the asset once and `seekTo(0)` + `play()` fires
 * it again, which is the pattern the SDK 57 docs give. A player per press
 * would allocate a decoder on the thread that draws the screen.
 *
 * ## The haptic respects the system setting, deliberately
 *
 * `performAndroidHapticsAsync` goes through the platform's own feedback
 * constants, so a phone with haptics switched off feels nothing — which
 * is the correct behaviour and was mistaken for a bug once already. The
 * alternative, `impactAsync`, drives the motor directly and would buzz at
 * somebody who has asked the system not to. It also needs no VIBRATE
 * permission, which keeps one line out of the manifest.
 */
export function useTapFeedback(): () => void {
  const click = useAudioPlayer(require("../../../assets/sounds/tab-tap.m4a"));

  useEffect(() => {
    /*
     * `mixWithOthers` so an 85ms tick never takes audio focus — without it
     * Android pauses whatever the viewer was listening to, for a sound
     * shorter than the gap between two words.
     *
     * `playsInSilentMode: false` so a phone set to silent stays silent.
     * Somebody who has silenced their phone has already answered the
     * question of whether they want to hear this.
     */
    setAudioModeAsync({ interruptionMode: "mixWithOthers", playsInSilentMode: false }).catch(() => {
      /* An audio mode the app can live without; the tick may simply duck. */
    });
  }, []);

  return useCallback(() => {
    click.seekTo(0);
    click.play();
    if (Platform.OS === "android") {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_On).catch(() => {});
    } else {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [click]);
}
