import { readCatalog, writeCatalog, type CatalogKind } from "@/db/repositories/catalogCacheRepository";
import type { XtreamProviderConfig } from "@/domain/provider/types";
import { getLiveCategories } from "@/providers/xtream/xtreamAdapter";
import { getVodCategories } from "@/providers/xtream/vodAdapter";
import { getSeriesCategories } from "@/providers/xtream/seriesAdapter";

export interface CategoryRow {
  id: string;
  name: string;
}

/**
 * Category lists, served from the device first.
 *
 * These screens reload on every focus, so hitting the provider each time
 * meant three extra `player_api.php` calls for simply navigating between
 * Live, Movies and Series — on a panel that blocks a line for asking too
 * often. The catalog written during preparation already contains them, so
 * a normal session makes zero category requests; the network is only used
 * when nothing is stored yet (a provider added before this cache existed,
 * or a section that failed during preparation), and the result is written
 * back so it is the last time.
 */
async function cachedCategories(
  providerId: string,
  kind: CatalogKind,
  fetcher: () => Promise<CategoryRow[]>
): Promise<CategoryRow[]> {
  const stored = await readCatalog<CategoryRow[]>(providerId, kind);
  if (stored && stored.data.length > 0) return stored.data;

  const fetched = await fetcher();
  await writeCatalog(providerId, kind, fetched);
  return fetched;
}

export function loadLiveCategories(providerId: string, config: XtreamProviderConfig): Promise<CategoryRow[]> {
  return cachedCategories(providerId, "live_categories", () => getLiveCategories(config));
}

export function loadMovieCategories(providerId: string, config: XtreamProviderConfig): Promise<CategoryRow[]> {
  return cachedCategories(providerId, "movie_categories", () => getVodCategories(config));
}

export function loadSeriesCategories(providerId: string, config: XtreamProviderConfig): Promise<CategoryRow[]> {
  return cachedCategories(providerId, "series_categories", () => getSeriesCategories(config));
}
