import { getDatabase } from "@/db/client";

export type ThemePreference = "dark" | "light" | "system";
export type ContentSection = "live" | "movies" | "series";

export interface AppState {
  legalAcceptedAt: number | null;
  legalAcceptedVersion: number | null;
  language: string | null;
  theme: ThemePreference;
  onboardingSeenAt: number | null;
  liveSectionVisible: boolean;
  moviesSectionVisible: boolean;
  seriesSectionVisible: boolean;
  resumeEnabled: boolean;
  autoplayNextEpisode: boolean;
  preferredAudioLang: string | null;
  preferredSubtitleLang: string | null;
  /** Remembered aspect choice for the player — a preference about the viewer's own screen, not the session. */
  playerFitMode: "contain" | "cover" | "fill";
  /** Null until the viewer sets one. Stored as plain text: this gates UI, it is not a security boundary. */
  parentalPin: string | null;
  /** Whether hidden categories additionally require the PIN to reveal. */
  parentalLockedCategories: boolean;
  /**
   * Keep playing when the app goes to the background. Off by default: on a
   * line limited to one connection, a stream left running in the background
   * silently blocks every other device.
   */
  backgroundPlayback: boolean;
  /**
   * Live TV shown as a pinned player above a channel list, instead of a
   * fullscreen player you navigate into and back out of. On by default
   * (migration 15) — it is now the intended way to watch, and the
   * fullscreen layout is what the expand button reaches for a single
   * channel. Only the Settings switch writes here; the player's expand
   * button is session-only, so one tap on it never changes how the next
   * channel opens.
   */
  splitChannelView: boolean;
}

interface AppStateRow {
  legal_accepted_at: number | null;
  legal_accepted_version: number | null;
  language: string | null;
  theme: ThemePreference;
  onboarding_seen_at: number | null;
  live_section_visible: number;
  movies_section_visible: number;
  series_section_visible: number;
  resume_enabled: number;
  autoplay_next_episode: number;
  preferred_audio_lang: string | null;
  preferred_subtitle_lang: string | null;
  player_fit_mode: "contain" | "cover" | "fill";
  parental_pin: string | null;
  parental_locked_categories: number;
  background_playback: number;
  split_channel_view: number;
}

function toAppState(row: AppStateRow): AppState {
  return {
    legalAcceptedAt: row.legal_accepted_at,
    legalAcceptedVersion: row.legal_accepted_version,
    language: row.language,
    theme: row.theme,
    onboardingSeenAt: row.onboarding_seen_at,
    liveSectionVisible: row.live_section_visible === 1,
    moviesSectionVisible: row.movies_section_visible === 1,
    seriesSectionVisible: row.series_section_visible === 1,
    resumeEnabled: row.resume_enabled === 1,
    autoplayNextEpisode: row.autoplay_next_episode === 1,
    preferredAudioLang: row.preferred_audio_lang,
    preferredSubtitleLang: row.preferred_subtitle_lang,
    playerFitMode: row.player_fit_mode ?? "contain",
    parentalPin: row.parental_pin,
    parentalLockedCategories: row.parental_locked_categories === 1,
    backgroundPlayback: row.background_playback === 1,
    splitChannelView: row.split_channel_view === 1,
  };
}

export async function getAppState(): Promise<AppState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AppStateRow>("SELECT * FROM app_state WHERE id = 1;");
  if (!row) throw new Error("app_state row missing — migration v6 should have seeded it.");
  return toAppState(row);
}

export async function setLegalAccepted(version: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE app_state SET legal_accepted_at = $now, legal_accepted_version = $version WHERE id = 1;",
    { $now: Date.now(), $version: version }
  );
}

export async function setLanguage(language: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET language = $language WHERE id = 1;", { $language: language });
}

export async function setTheme(theme: ThemePreference): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET theme = $theme WHERE id = 1;", { $theme: theme });
}

export async function setOnboardingSeen(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET onboarding_seen_at = $now WHERE id = 1;", { $now: Date.now() });
}

const SECTION_COLUMN: Record<ContentSection, string> = {
  live: "live_section_visible",
  movies: "movies_section_visible",
  series: "series_section_visible",
};

export async function setSectionVisible(section: ContentSection, visible: boolean): Promise<void> {
  const db = await getDatabase();
  const column = SECTION_COLUMN[section];
  await db.runAsync(`UPDATE app_state SET ${column} = $visible WHERE id = 1;`, { $visible: visible ? 1 : 0 });
}

export async function setResumeEnabled(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET resume_enabled = $enabled WHERE id = 1;", { $enabled: enabled ? 1 : 0 });
}

export async function setAutoplayNextEpisode(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET autoplay_next_episode = $enabled WHERE id = 1;", {
    $enabled: enabled ? 1 : 0,
  });
}

export async function setPreferredAudioLang(lang: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET preferred_audio_lang = $lang WHERE id = 1;", { $lang: lang });
}

export async function setPreferredSubtitleLang(lang: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET preferred_subtitle_lang = $lang WHERE id = 1;", { $lang: lang });
}

export async function setPlayerFitMode(mode: AppState["playerFitMode"]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET player_fit_mode = $mode WHERE id = 1;", { $mode: mode });
}

/**
 * Stores the parental PIN. Plain text on purpose, and documented as such:
 * this gates a UI toggle on the user's own device, it is not protecting a
 * secret from anyone with the device unlocked. Treating it as a credential
 * would imply a guarantee this cannot make.
 */
export async function setParentalPin(pin: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET parental_pin = $pin WHERE id = 1;", { $pin: pin });
}

export async function setParentalLockedCategories(locked: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET parental_locked_categories = $locked WHERE id = 1;", {
    $locked: locked ? 1 : 0,
  });
}

export async function setBackgroundPlayback(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET background_playback = $enabled WHERE id = 1;", {
    $enabled: enabled ? 1 : 0,
  });
}

export async function setSplitChannelView(enabled: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE app_state SET split_channel_view = $enabled WHERE id = 1;", {
    $enabled: enabled ? 1 : 0,
  });
}
