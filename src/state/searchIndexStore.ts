import type { SQLiteDatabase } from "expo-sqlite";

import { getDatabase } from "@/db/client";
import type { LiveChannel, XtreamProviderConfig } from "@/domain/provider/types";
import { getSeriesList, loadSeriesList } from "@/state/seriesStore";
import { getVodMovies, loadVodMovies } from "@/state/vodStore";

export type SearchContentType = "live" | "movie" | "series";

export interface SearchResult {
  contentType: SearchContentType;
  providerItemId: string;
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

interface IndexRow {
  contentType: SearchContentType;
  providerItemId: string;
  name: string;
  subtitle: string | null;
  imageUrl: string | null;
  categoryId: string | null;
}

/** Rows per batched INSERT — one native round-trip per batch instead of one per row (~38k rows total). */
const BATCH_SIZE = 300;

let indexed = false;

/** Called by activeSessionStore whenever the session changes — the next ensureSearchIndexReady() rebuilds from scratch. */
export function resetSearchIndex(): void {
  indexed = false;
}

async function insertBatched(db: SQLiteDatabase, rows: IndexRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const params = chunk.flatMap((r) => [r.contentType, r.providerItemId, r.name, r.subtitle, r.imageUrl, r.categoryId]);
    await db.runAsync(
      `INSERT INTO search_index (content_type, provider_item_id, name, subtitle, image_url, category_id) VALUES ${placeholders};`,
      params
    );
  }
}

/**
 * Builds (once per session) a SQLite-backed search index from live
 * channels (already loaded at session restore) plus movies/series —
 * lazy-loading those here if the user hasn't visited those sections yet,
 * so search always covers everything master prompt §18 asks for ("live;
 * movies; series"), not just whatever happens to already be in memory.
 *
 * Rebuilding is a one-time per-session cost (shown behind a loading state
 * in the search screen); searching *from* the index afterwards is what
 * happens on every keystroke (see searchContent) — that split is the
 * actual point of §18's "use SQLite/indexed querying rather than filtering
 * 20,000 JS objects [on every keystroke]". Inserts are batched (300
 * rows/statement) rather than one `executeAsync` per row — verified this
 * matters at this project's real scale (~38k combined rows across our test
 * provider's live+movie+series catalogs).
 */
export async function ensureSearchIndexReady(
  config: XtreamProviderConfig,
  channels: LiveChannel[]
): Promise<void> {
  if (indexed) return;

  const movies = getVodMovies() ?? (await loadVodMovies(config));
  const series = getSeriesList() ?? (await loadSeriesList(config));

  const rows: IndexRow[] = [
    ...channels.map((c) => ({
      contentType: "live" as const,
      providerItemId: c.providerItemId,
      name: c.name,
      subtitle: null,
      imageUrl: c.logoUrl,
      categoryId: c.categoryId,
    })),
    ...movies.map((m) => ({
      contentType: "movie" as const,
      providerItemId: m.providerItemId,
      name: m.name,
      // MovieSummary has no year field — this provider never supplies one
      // for movies (see docs/DECISIONS.md), unlike series.
      subtitle: null,
      imageUrl: m.posterUrl,
      categoryId: m.categoryId,
    })),
    ...series.map((s) => ({
      contentType: "series" as const,
      providerItemId: s.providerItemId,
      name: s.name,
      subtitle: s.year,
      imageUrl: s.posterUrl,
      categoryId: s.categoryId,
    })),
  ];

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.execAsync("DELETE FROM search_index;");
    await insertBatched(db, rows);
  });

  indexed = true;
}

export async function searchContent(query: string, limit = 50): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    content_type: SearchContentType;
    provider_item_id: string;
    name: string;
    subtitle: string | null;
    image_url: string | null;
    category_id: string | null;
  }>(
    `SELECT content_type, provider_item_id, name, subtitle, image_url, category_id
     FROM search_index
     WHERE name LIKE '%' || ? || '%' COLLATE NOCASE
     ORDER BY name COLLATE NOCASE
     LIMIT ?;`,
    [trimmed, limit]
  );

  return rows.map((row) => ({
    contentType: row.content_type,
    providerItemId: row.provider_item_id,
    name: row.name,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    categoryId: row.category_id,
  }));
}
