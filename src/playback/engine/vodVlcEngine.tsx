import type { StyleProp, ViewStyle } from "react-native";

import type { VlcLivePlayer, VlcLiveSource } from "./vlc/VlcLivePlayer";

/**
 * Android and Android TV: no libVLC path for films and episodes — ExoPlayer
 * opens every container the provider serves. The iPhone implementation is
 * `vodVlcEngine.ios.tsx`; this file exists so the shared VOD screens compile
 * and render nothing extra here.
 */
export function useVlcVodPlayer(source: VlcLiveSource | null): VlcLivePlayer | null {
  void source;
  return null;
}

export function VlcVodVideoView(props: { player: VlcLivePlayer; style?: StyleProp<ViewStyle> }): null {
  void props;
  return null;
}
