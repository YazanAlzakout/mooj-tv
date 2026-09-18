export interface Migration {
  version: number;
  /** Runs inside a transaction. Keep each migration additive — never edit a shipped one. */
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE providers (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_connected_at INTEGER
      );
      CREATE INDEX idx_providers_is_active ON providers(is_active);
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE live_tv_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_category_id TEXT,
        last_channel_id TEXT
      );
      INSERT INTO live_tv_state (id) VALUES (1);
    `,
  },
  {
    version: 3,
    up: `
      CREATE TABLE search_index (
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        category_id TEXT,
        PRIMARY KEY (content_type, provider_item_id)
      );
      CREATE INDEX idx_search_index_name ON search_index(name COLLATE NOCASE);
    `,
  },
  {
    version: 4,
    up: `
      CREATE TABLE watch_progress (
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        position_seconds REAL NOT NULL,
        duration_seconds REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        container_extension TEXT NOT NULL,
        series_id TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        PRIMARY KEY (content_type, provider_item_id)
      );
      CREATE INDEX idx_watch_progress_updated_at ON watch_progress(updated_at DESC);
      CREATE INDEX idx_watch_progress_series_id ON watch_progress(series_id);
    `,
  },
  {
    version: 5,
    up: `
      CREATE TABLE library_items (
        list_type TEXT NOT NULL,
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        title TEXT NOT NULL,
        image_url TEXT,
        category_id TEXT,
        container_extension TEXT,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (list_type, content_type, provider_item_id)
      );
      CREATE INDEX idx_library_items_list_added ON library_items(list_type, added_at DESC);
    `,
  },
  {
    version: 6,
    up: `
      CREATE TABLE app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        legal_accepted_at INTEGER
      );
      INSERT INTO app_state (id) VALUES (1);
    `,
  },
  {
    version: 7,
    up: `
      ALTER TABLE app_state ADD COLUMN language TEXT;
      ALTER TABLE app_state ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark';
      ALTER TABLE app_state ADD COLUMN legal_accepted_version INTEGER;
      ALTER TABLE app_state ADD COLUMN onboarding_seen_at INTEGER;
      ALTER TABLE app_state ADD COLUMN live_section_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN movies_section_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN series_section_visible INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN resume_enabled INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN autoplay_next_episode INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE app_state ADD COLUMN preferred_audio_lang TEXT;
      ALTER TABLE app_state ADD COLUMN preferred_subtitle_lang TEXT;
    `,
  },
  {
    version: 8,
    up: `
      CREATE TABLE hidden_categories (
        content_type TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (content_type, category_id)
      );
    `,
  },
  {
    version: 9,
    up: `
      CREATE TABLE download_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        content_type TEXT NOT NULL,
        provider_item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        image_url TEXT,
        container_extension TEXT NOT NULL,
        source_url TEXT NOT NULL,
        local_uri TEXT,
        status TEXT NOT NULL,
        bytes_downloaded INTEGER NOT NULL DEFAULT 0,
        bytes_total INTEGER,
        series_id TEXT,
        season_number INTEGER,
        episode_number INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        error_message TEXT,
        resume_state TEXT
      );
      CREATE INDEX idx_download_tasks_status ON download_tasks(status);
      CREATE INDEX idx_download_tasks_updated_at ON download_tasks(updated_at DESC);
    `,
  },
  {
    version: 10,
    up: `
      CREATE TABLE catalog_cache (
        provider_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        fetched_at INTEGER NOT NULL,
        PRIMARY KEY (provider_id, kind)
      );
    `,
  },
  {
    version: 11,
    up: `
      CREATE TABLE epg_programmes (
        channel_id TEXT NOT NULL,
        id TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        stop_ms INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        PRIMARY KEY (channel_id, start_ms)
      );
      CREATE INDEX idx_epg_channel_stop ON epg_programmes(channel_id, stop_ms);
      CREATE TABLE epg_fetch_log (
        channel_id TEXT PRIMARY KEY NOT NULL,
        fetched_at INTEGER NOT NULL
      );
    `,
  },
  {
    version: 12,
    up: `
      ALTER TABLE app_state ADD COLUMN player_fit_mode TEXT NOT NULL DEFAULT 'contain';
      ALTER TABLE app_state ADD COLUMN parental_pin TEXT;
      ALTER TABLE app_state ADD COLUMN parental_locked_categories INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 13,
    up: `
      ALTER TABLE app_state ADD COLUMN background_playback INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 14,
    up: `
      ALTER TABLE app_state ADD COLUMN split_channel_view INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    version: 15,
    up: `
      UPDATE app_state SET split_channel_view = 1;
    `,
  },
  {
    /*
     * Marks whether the one-time import of the published 1.x app's saved
     * providers has run (src/db/legacyProviderImport.ts).
     *
     * A flag rather than "is the providers table empty": this release ships
     * under the same package id as 1.x and inherits its stored data, so
     * without a flag, deleting an imported provider would bring it back on
     * the next launch.
     */
    version: 16,
    up: `
      ALTER TABLE app_state ADD COLUMN legacy_import_done INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    /*
     * Scrubs provider credentials out of the download rows.
     *
     * An Xtream stream URL carries the username and password in its path,
     * and both `source_url` and the `url` inside `resume_state` held one —
     * so a user who had downloaded anything had their password sitting in
     * SQLite, and therefore in Android's automatic cloud backup. Both are
     * now rebuilt from SecureStore when a download starts or resumes
     * (src/domain/downloads/resolveSourceUrl.ts) and never written.
     *
     * Clearing `resume_state` costs a paused download its byte offset: it
     * restarts instead of continuing. That is the right trade for removing
     * a credential from disk, and it happens once.
     */
    version: 17,
    up: `
      UPDATE download_tasks SET source_url = '', resume_state = NULL;
    `,
  },
  {
    /*
     * How the Live TV section looks on Android TV. Three values:
     *
     *   'browse'    the channel list with a category sidebar, and the
     *               player opened from it — the default, because a remote
     *               needs somewhere to navigate before it needs a picture
     *   'immersive' straight to a full-screen picture, the guide on demand
     *   'split'     the picture beside a permanent channel list
     *
     * Separate from `split_channel_view`, which is the phone's portrait
     * layout: that one defaults to on and means something else entirely.
     */
    version: 18,
    up: `
      ALTER TABLE app_state ADD COLUMN tv_channel_layout TEXT NOT NULL DEFAULT 'browse';
    `,
  },
  {
    /*
     * Undoes 18. The three selectable TV layouts are gone (2026-09-10): the
     * category rail beside the channel grid is now the only shape Live TV
     * takes on a television, so there is no choice left to store.
     *
     * The other two never earned their place. "immersive" put a viewer in a
     * full-screen picture with no list to navigate, which is the situation a
     * remote handles worst, and "split" was a third code path over the same
     * player that had to be kept in step with the other two for no gain the
     * rail did not already give. A setting the viewer has to find, in order
     * to reach the layout that should have been the only one, is not a
     * feature.
     *
     * DROP COLUMN rather than a dead column left in place: SQLite has
     * supported it since 3.35 and expo-sqlite 57 bundles 3.50.3 (verified in
     * vendor/sqlite3/sqlite3.h), `app_state` is read with `SELECT *` into a
     * typed row, and nothing indexes this column.
     */
    version: 19,
    up: `
      ALTER TABLE app_state DROP COLUMN tv_channel_layout;
    `,
  },
];
