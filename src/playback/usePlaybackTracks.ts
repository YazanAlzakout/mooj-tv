import { useEventListener } from "expo";
import type { AudioTrack, SubtitleTrack, VideoPlayer } from "expo-video";
import { useState } from "react";

export interface UsePlaybackTracksResult {
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  currentAudioTrack: AudioTrack | null;
  currentSubtitleTrack: SubtitleTrack | null;
  selectAudioTrack: (track: AudioTrack) => void;
  selectSubtitleTrack: (track: SubtitleTrack | null) => void;
}

interface TracksState {
  sourceKey: string;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  currentAudioTrack: AudioTrack | null;
  currentSubtitleTrack: SubtitleTrack | null;
  /** Whether the user's preferred-language auto-selection has already been applied for this source. */
  autoAudioApplied: boolean;
  autoSubtitleApplied: boolean;
}

function emptyState(sourceKey: string): TracksState {
  return {
    sourceKey,
    audioTracks: [],
    subtitleTracks: [],
    currentAudioTrack: null,
    currentSubtitleTrack: null,
    autoAudioApplied: false,
    autoSubtitleApplied: false,
  };
}

/**
 * The language tag reduced to its primary subtag: `pt-BR` and `pt_br`
 * both become `pt`. BCP 47 puts the language first and everything that
 * narrows it after, so this is the part a short preference is about.
 */
function primarySubtag(value: string): string {
  return value.trim().toLowerCase().split(/[-_]/)[0];
}

/**
 * Whether a track is the language the viewer asked for — in two passes,
 * because one was wrong.
 *
 * It used to be a single substring test across language, label and name.
 * Substrings are fine for a word and catastrophic for a code: "ar" is
 * inside "Arabic" and also inside "Mandarin", "Hungarian", "Bulgarian"
 * and "Catalan"; "fa" is inside "Farsi" and inside "Dari Afghan"; "he" is
 * inside "Hebrew" and inside "Chechen". `find` takes the first hit, so a
 * viewer who set "ar" got whichever of those the provider happened to
 * list first — and with the common ordering, that is not Arabic.
 *
 * So the exact pass runs first and over the whole track list, and only if
 * nothing matches does the loose pass run, and only for a needle long
 * enough that a substring means something. Three characters, because
 * ISO 639-2 codes are three long and a real word is longer.
 */
export function findPreferredTrack<T extends AudioTrack | SubtitleTrack>(
  tracks: T[],
  preferred: string
): T | undefined {
  const needle = preferred.trim().toLowerCase();
  if (!needle) return undefined;

  const wanted = primarySubtag(needle);
  const exact = tracks.find((track) => track.language && primarySubtag(track.language) === wanted);
  if (exact) return exact;

  if (needle.length <= 3) return undefined;
  return tracks.find((track) =>
    [track.language, track.label, track.name].some((v) => v?.toLowerCase().includes(needle))
  );
}

/**
 * Master prompt §24.4/§24.5: expose native audio/subtitle tracks when
 * available, with human-readable labels. `availableAudioTracks` /
 * `availableSubtitleTracks` are read-only properties that only become
 * populated asynchronously once the source has loaded, so this listens for
 * the corresponding `*Change` events rather than reading the properties
 * once — reading them at mount would almost always see an empty array.
 *
 * `sourceKey` is §24.4's "do not accidentally apply an old track index to
 * an unrelated channel" guard. The movie and episode players are one-shot
 * (one source per screen instance) and can leave it at its default, but
 * the live player reuses a single `VideoPlayer` across every channel
 * switch: passing the channel id there discards the previous channel's
 * track list and re-arms the preferred-language auto-selection, so the
 * chrome never offers a track that belongs to a stream that is no longer
 * playing.
 *
 * `preferredAudioLang`/`preferredSubtitleLang` (Settings → Playback, free
 * text since provider track languages aren't limited to the app's own UI
 * locales) are applied at most once per source, the first time each track
 * list populates — after that the user's own manual selection is never
 * overridden by this hook again until the source changes.
 */
export function usePlaybackTracks(
  player: VideoPlayer,
  preferredAudioLang?: string | null,
  preferredSubtitleLang?: string | null,
  sourceKey: string = "single-source"
): UsePlaybackTracksResult {
  const [state, setState] = useState<TracksState>(() => emptyState(sourceKey));

  /**
   * Reset when the player is pointed at a different source — done during
   * render, React's documented "adjust state when a prop changes" pattern,
   * rather than in a `useEffect` (which this project's
   * `react-hooks/set-state-in-effect` rule flags).
   */
  if (state.sourceKey !== sourceKey) {
    setState(emptyState(sourceKey));
  }

  /* eslint-disable react-hooks/immutability -- native player property setters, see doc comment above. */
  useEventListener(player, "availableAudioTracksChange", ({ availableAudioTracks }) => {
    let autoApplied = state.autoAudioApplied;
    if (!autoApplied && preferredAudioLang) {
      const match = findPreferredTrack(availableAudioTracks, preferredAudioLang);
      if (match) {
        autoApplied = true;
        player.audioTrack = match;
      }
    }
    setState((prev) => ({ ...prev, audioTracks: availableAudioTracks, autoAudioApplied: autoApplied }));
  });
  useEventListener(player, "availableSubtitleTracksChange", ({ availableSubtitleTracks }) => {
    let autoApplied = state.autoSubtitleApplied;
    if (!autoApplied && preferredSubtitleLang) {
      const match = findPreferredTrack(availableSubtitleTracks, preferredSubtitleLang);
      if (match) {
        autoApplied = true;
        player.subtitleTrack = match;
      }
    }
    setState((prev) => ({ ...prev, subtitleTracks: availableSubtitleTracks, autoSubtitleApplied: autoApplied }));
  });
  /* eslint-enable react-hooks/immutability */
  useEventListener(player, "audioTrackChange", ({ audioTrack }) => {
    setState((prev) => ({ ...prev, currentAudioTrack: audioTrack }));
  });
  useEventListener(player, "subtitleTrackChange", ({ subtitleTrack }) => {
    setState((prev) => ({ ...prev, currentSubtitleTrack: subtitleTrack }));
  });

  function selectAudioTrack(track: AudioTrack) {
    setState((prev) => ({ ...prev, autoAudioApplied: true }));
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.audioTrack = track;
  }

  function selectSubtitleTrack(track: SubtitleTrack | null) {
    setState((prev) => ({ ...prev, autoSubtitleApplied: true }));
    // eslint-disable-next-line react-hooks/immutability -- native player property setter, same reasoning as useWatchProgress.ts.
    player.subtitleTrack = track;
  }

  return {
    audioTracks: state.audioTracks,
    subtitleTracks: state.subtitleTracks,
    currentAudioTrack: state.currentAudioTrack,
    currentSubtitleTrack: state.currentSubtitleTrack,
    selectAudioTrack,
    selectSubtitleTrack,
  };
}
