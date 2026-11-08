import { DEMO_ART_PREFIX, DEMO_CONTENT, demoChannelName } from "@/core/demo/demoMode";
import type { LiveChannel, Provider, XtreamProviderConfig } from "@/domain/provider/types";
import type { XtreamAccountInfo } from "@/providers/xtream/xtreamAdapter";
import { resetSearchIndex } from "@/state/searchIndexStore";
import { clearSeriesList } from "@/state/seriesStore";
import { clearVodMovies } from "@/state/vodStore";

/**
 * The currently-active provider's resolved config + last-fetched channel
 * list, in memory only. The durable state is the `providers` SQLite table
 * (src/db) plus SecureStore credentials — this is just a runtime cache so
 * screens don't each re-authenticate and re-fetch independently.
 */
interface ActiveSession {
  provider: Provider;
  config: XtreamProviderConfig;
  channels: LiveChannel[];
  /** From the login response — master prompt §17/§28 account/subscription display. */
  accountInfo: XtreamAccountInfo | null;
}

let session: ActiveSession | null = null;

export function setActiveSession(next: ActiveSession): void {
  /**
   * Only an actual provider switch invalidates the previously-cached
   * VOD/series catalogs and the search index built from them — never let
   * one provider's content leak into another's session.
   *
   * This used to run unconditionally on every call, which made this
   * function unsafe to use for "same provider, updated field" writes.
   * `refreshActiveSessionChannels` (manual pull-to-refresh on the live
   * channel list) and the background catalog refresh both do exactly
   * that — rebuild the same session with a fresher `channels` array — and
   * neither repopulates Movies/Series afterward, since neither touched
   * them. The result (confirmed 2026-09-03): pulling to refresh Live TV
   * silently emptied the Home screen's Movies/Series counts until the
   * user happened to reopen those sections. Comparing provider ids here
   * is what makes the wipe fire only on a genuine switch.
   */
  const isProviderSwitch = session === null || session.provider.id !== next.provider.id;
  if (isProviderSwitch) {
    clearVodMovies();
    clearSeriesList();
    resetSearchIndex();
  }
  session = next;
}

export function getActiveSession(): ActiveSession | null {
  /*
   * Store-listing capture only; dead in every shipping build. Every
   * channel gets an invented name, generated artwork and one of ten
   * invented categories, so the app can be photographed running on a
   * lineup that belongs to nobody. See core/demo/demoMode.ts.
   *
   * Applied here rather than at the fetch, because this is what every
   * screen reads: the grid, the player, the search index and the category
   * rail all come through this one accessor, so one branch covers them.
   */
  if (DEMO_CONTENT && session) {
    return {
      ...session,
      provider: { ...session.provider, name: "My Provider" },
      channels: session.channels.map((c, i) => ({
        ...c,
        name: demoChannelName(c.providerItemId, i),
        /*
         * `categoryId` is deliberately left alone. The category rail is
         * built from the ids actually present on the channels, so moving
         * them would empty every category but "All". The names are
         * replaced where the categories themselves are read — see
         * state/categoryQueries.ts.
         */
        logoUrl: DEMO_ART_PREFIX + c.providerItemId,
      })),
    };
  }
  return session;
}

/**
 * Whether this provider carries any guide data at all.
 *
 * Panels that supply none return `epg_channel_id: null` for every channel
 * and an empty `epg_listings` for every `get_short_epg` call — the test
 * provider does exactly that for all 11,356 of its channels. Asking anyway
 * would be one wasted request per channel opened, on a panel that blocks a
 * line for asking too often, in exchange for nothing to display.
 */
export function providerHasEpg(): boolean {
  if (!session) return false;
  return session.channels.some((channel) => channel.epgChannelId !== null);
}

export function clearActiveSession(): void {
  clearVodMovies();
  clearSeriesList();
  resetSearchIndex();
  session = null;
}
