import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CachedImage } from "@/components/CachedImage";
import { Focusable } from "@/components/Focusable";
import { AndroidTextFix, Brand, Colors, FontFamily, Radii, Spacing } from "@/core/theme/tokens";
import type { LiveChannel } from "@/domain/provider/types";

/** Exported so a list can size itself with `getItemLayout` without guessing. */
export const CHANNEL_ROW_HEIGHT = 64;
export const CHANNEL_ROW_SPACING = Spacing.sm;

/**
 * One compact channel row — number, logo, name, stream format — used by
 * every surface that switches channels beside a running video: the guide
 * panel over the fullscreen player, and the list under the split layout.
 *
 * Deliberately a plain `Pressable` (via `Focusable`) with no `entering`
 * animation and no per-row EPG request: these lists carry the provider's
 * whole lineup (~11k channels), rows mount and unmount continuously while
 * scrolling, and both of those were measured causes of real problems — a
 * stuttering scroll, and hundreds of `player_api.php` calls in seconds that
 * got the whole line rate-limited (docs/DECISIONS.md).
 */
export function ChannelListRow({
  channel,
  index,
  active,
  tvFocusFirst = false,
  onPress,
}: {
  channel: LiveChannel;
  index: number;
  active: boolean;
  /**
   * Where a remote lands when the list opens. Set on the channel that is
   * currently playing, so the guide opens on what the viewer is watching
   * rather than at the top of eleven thousand rows.
   */
  tvFocusFirst?: boolean;
  onPress: () => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <Focusable onPress={onPress} style={[styles.row, active && styles.rowActive]} hasTVPreferredFocus={tvFocusFirst}>
      <View style={[styles.numberBadge, active && styles.numberBadgeActive]}>
        <Text style={styles.numberBadgeText}>{index + 1}</Text>
      </View>
      {channel.logoUrl && !logoFailed ? (
        <CachedImage
          uri={channel.logoUrl}
          style={styles.logo}
          resizeMode="contain"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <View style={styles.logoFallback}>
          <Text style={styles.logoFallbackText}>{channel.name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.textCol}>
        <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
          {channel.name}
        </Text>
      </View>
      {active && <Text style={styles.activeMark}>▶</Text>}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: CHANNEL_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    marginBottom: CHANNEL_ROW_SPACING,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowActive: { borderColor: Brand.primary, backgroundColor: Brand.primaryMuted },
  numberBadge: {
    minWidth: 26,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: Radii.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  numberBadgeActive: { backgroundColor: Brand.primary },
  numberBadgeText: { color: Colors.text, fontSize: 11, fontFamily: FontFamily.bold, ...AndroidTextFix },
  logo: { width: 32, height: 32, borderRadius: Radii.sm },
  logoFallback: {
    width: 32,
    height: 32,
    borderRadius: Radii.sm,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackText: { color: Colors.textSecondary, fontSize: 13, fontFamily: FontFamily.bold },
  textCol: { flex: 1, gap: 2 },
  name: { color: Colors.text, fontSize: 13, lineHeight: 20, fontFamily: FontFamily.medium, ...AndroidTextFix },
  nameActive: { color: Brand.primaryLight, fontFamily: FontFamily.bold },
  activeMark: { color: Brand.primary, fontSize: 12 },
});
