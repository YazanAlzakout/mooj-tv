import { useEffect, useState, useSyncExternalStore } from "react";

import type { EpgProgram } from "@/domain/epg/types";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { lastFetchedAt, readProgrammes, writeProgrammes } from "@/db/repositories/epgRepository";
import { getShortEpg } from "@/providers/xtream/epgAdapter";
import { providerHasEpg } from "@/state/activeSessionStore";

/** How long an in-memory answer is reused before consulting the device copy. */
const CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * How long the device copy stands before the provider is asked again. Long
 * on purpose: a guide is a nicety, and this app must not spend a panel's
 * small request budget refreshing one.
 */
const STORED_TTL_MS = 6 * 60 * 60 * 1000;
/** How often "now" ticks for every now/next computation and progress bar. */
const CLOCK_TICK_MS = 60 * 1000;
/**
 * How long a channel row must stay on screen before its EPG is worth
 * fetching. Generous on purpose: this panel's request budget is small
 * enough that nine sequential calls tripped it, so EPG — which is a nicety,
 * not something playback depends on — must never compete with the calls
 * that actually matter.
 */
const SETTLE_MS = 900;

interface CacheEntry {
  programs: EpgProgram[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<EpgProgram[]>>();

// A single shared, externally-ticking clock — reading `Date.now()` directly
// during render is disallowed (components must be pure), so every consumer
// subscribes to this instead of running its own setInterval.
let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockInterval: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockInterval) {
    clockInterval = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };
}

function getClockSnapshot(): number {
  return clockNow;
}

/** Shared clock tick (updates every CLOCK_TICK_MS) — for progress bars etc. that need "now" without calling Date.now() during render. */
export function useNowTick(): number {
  return useSyncExternalStore(subscribeClock, getClockSnapshot, getClockSnapshot);
}

function isFresh(entry: CacheEntry, now: number): boolean {
  return now - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Device first, provider only if necessary.
 *
 * The stored copy is authoritative for STORED_TTL_MS — including a stored
 * *empty* result, which is why `lastFetchedAt` is consulted separately: a
 * channel the provider has nothing for must not be re-asked on every
 * visit, and "no rows" alone cannot tell "never asked" from "asked, has
 * nothing".
 */
function fetchAndCache(config: XtreamProviderConfig, channelId: string): Promise<EpgProgram[]> {
  const existing = inFlight.get(channelId);
  if (existing) return existing;

  const promise = (async () => {
    const now = Date.now();
    try {
      const askedAt = await lastFetchedAt(channelId);
      if (askedAt !== null && now - askedAt < STORED_TTL_MS) {
        const stored = await readProgrammes(channelId, now - 60 * 60 * 1000);
        cache.set(channelId, { programs: stored, fetchedAt: now });
        return stored;
      }
    } catch {
      // A storage problem must not stop the network path below.
    }

    try {
      const programs = await getShortEpg(config, channelId);
      cache.set(channelId, { programs, fetchedAt: Date.now() });
      await writeProgrammes(channelId, programs).catch(() => {});
      return programs;
    } catch {
      // Never surface EPG failures to the user — "no data" (master prompt
      // §20) is the correct fallback, not an error banner on the channel list.
      cache.set(channelId, { programs: [], fetchedAt: Date.now() });
      return [] as EpgProgram[];
    }
  })().finally(() => {
    inFlight.delete(channelId);
  });

  inFlight.set(channelId, promise);
  return promise;
}

export interface EpgNowNext {
  now: EpgProgram | null;
  next: EpgProgram | null;
  loading: boolean;
}

const EMPTY: EpgNowNext = { now: null, next: null, loading: false };

/**
 * Now/next EPG for one channel. Cached and de-duplicated across every
 * component asking for the same channel id, so a channel row and the
 * player screen never trigger two in-flight requests for the same channel.
 * Relies on the caller only mounting this for channels that are actually
 * on/near screen (e.g. FlatList's own virtualization) — never call this
 * for an entire unbounded channel list at once.
 */
export function useEpgNowNext(
  config: XtreamProviderConfig | null,
  channelId: string | null
): EpgNowNext {
  const [, forceRender] = useState(0);
  const now = useNowTick();

  useEffect(() => {
    // A provider that carries no guide at all is never asked — see
    // `providerHasEpg`. On such a provider this hook makes zero requests
    // for the whole session instead of one per channel opened.
    if (!config || !channelId || !providerHasEpg()) return;
    const existing = cache.get(channelId);
    if (existing && isFresh(existing, Date.now())) return;

    let cancelled = false;
    /*
      Deliberately delayed, not immediate. A FlatList mounts and unmounts
      rows continuously while scrolling, so firing on mount meant a channel
      the user never even saw still cost one `get_short_epg` request — and
      a fast scroll through a large lineup produced hundreds of them in a
      few seconds, which the provider's Cloudflare front end answered by
      refusing every subsequent request from that address (see
      core/network/requestQueue.ts). Waiting SETTLE_MS means only rows the
      user actually stops on ever ask for EPG; rows scrolled past are
      cancelled before they cost anything.
    */
    const timer = setTimeout(() => {
      fetchAndCache(config, channelId).then(() => {
        if (!cancelled) forceRender((n) => n + 1);
      });
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [config, channelId]);

  if (!channelId || !providerHasEpg()) return EMPTY;

  const entry = cache.get(channelId);
  if (!entry) return { now: null, next: null, loading: true };

  const nowProgram = entry.programs.find((p) => p.startTimestamp <= now && now < p.stopTimestamp) ?? null;
  const nextProgram =
    entry.programs.find((p) => p.startTimestamp > (nowProgram?.stopTimestamp ?? now)) ?? null;

  return { now: nowProgram, next: nextProgram, loading: false };
}
