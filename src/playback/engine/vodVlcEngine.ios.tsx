import VLCPlayerView, { type VLCPlayerRef } from "@lunarr/vlc-player";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { VlcLivePlayer, type VlcLiveSource } from "./vlc/VlcLivePlayer";

/**
 * Films and episodes through libVLC, on iPhone, for the containers AVPlayer
 * cannot open (mkv, avi, … — see `iosContainers.ts`).
 *
 * ## Why
 *
 * The second iPhone build (2026-11-26) showed that the provider's films and
 * episodes are almost all in such containers: every title the tester opened
 * said "This file uses a format your device cannot play". Live TV already
 * plays through libVLC on iPhone, and the same adapter (`VlcLivePlayer`) is
 * used here in its `"vod"` mode, which adds what a film needs and a channel
 * does not — position, seeking, length, speed, `timeUpdate` and
 * `playToEnd` — and treats the end of the file as the end, not a dropout.
 *
 * The adapter implements the part of expo-video's `VideoPlayer` the VOD
 * screen, `VodPlayerControls` and the playback hooks use, so the screen
 * picks one player or the other at the top and nothing below it changes.
 * Files AVPlayer *can* open (mp4, m4v, mov, m3u8) stay on AVPlayer.
 *
 * Experimental (branch `ios-vod-vlc`): memory, heat and time to first frame
 * still have to be measured on the device before this ships.
 */

/** Frequent enough for a 0.5 s `timeUpdate` (useWatchProgress, the seek bar). */
const PROGRESS_INTERVAL_MS = 250;

/**
 * One libVLC player for the life of the screen, following `source`.
 *
 * Plays as soon as it has a source: both VOD screens' expo-video setup does
 * exactly that (`p.play()`), and this stands in for it. `null` releases the
 * stream — which is also what keeps this hook harmless on a screen using
 * AVPlayer: it is called with `null` there and never opens anything.
 */
export function useVlcVodPlayer(source: VlcLiveSource | null): VlcLivePlayer | null {
  const [player] = useState(() => new VlcLivePlayer("vod"));
  const uri = source?.uri ?? null;
  const userAgent = source?.headers?.["User-Agent"];

  useEffect(() => {
    if (uri === null) {
      void player.releaseSource();
      return;
    }
    void player.replaceAsync({ uri, headers: userAgent ? { "User-Agent": userAgent } : undefined });
    player.play();
  }, [player, uri, userAgent]);

  useEffect(() => {
    return () => player.dispose();
  }, [player]);

  return player;
}

export function VlcVodVideoView({ player, style }: { player: VlcLivePlayer; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<VLCPlayerRef | null>(null);
  const surface = useSyncExternalStore(player.subscribeSurface, player.getSurfaceSnapshot);

  useEffect(() => {
    player.attachSurface(ref);
    return () => player.detachSurface(ref);
  }, [player]);

  /*
    `key={surface.sourceKey}`: a fresh native view per source, for the same
    two reasons as `LiveVideoView` (see livePlaybackEngine.ios.tsx).
  */
  return (
    <VLCPlayerView
      key={surface.sourceKey}
      ref={ref}
      style={style}
      source={surface.source}
      paused={surface.paused}
      volume={surface.volume}
      rate={surface.rate}
      repeat={false}
      resizeMode="contain"
      continueAudioInBackground={surface.continueAudioInBackground}
      progressUpdateInterval={PROGRESS_INTERVAL_MS}
      onProgress={player.handleProgress}
      onLoadStart={player.handleLoadStart}
      onLoad={player.handleOpening}
      onBuffer={player.handleBuffer}
      onPlaying={player.handlePlaying}
      onPaused={player.handlePaused}
      onStopped={player.handleStopped}
      onEnd={player.handleEnded}
      onError={player.handleError}
      onTracks={player.handleTracks}
    />
  );
}
