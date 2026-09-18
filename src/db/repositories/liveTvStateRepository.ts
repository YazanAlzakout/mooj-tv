import { getDatabase } from "@/db/client";

export interface LiveTvState {
  lastCategoryId: string | null;
  lastChannelId: string | null;
}

/**
 * Single-row durable state for "remember last live category/channel"
 * (master prompt §19). No resume UI is wired to this yet — it's just
 * persisted so a future Continue Watching / resume feature has it.
 */
export async function getLiveTvState(): Promise<LiveTvState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ last_category_id: string | null; last_channel_id: string | null }>(
    "SELECT last_category_id, last_channel_id FROM live_tv_state WHERE id = 1;"
  );
  return {
    lastCategoryId: row?.last_category_id ?? null,
    lastChannelId: row?.last_channel_id ?? null,
  };
}

export async function setLastCategoryId(categoryId: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE live_tv_state SET last_category_id = $categoryId WHERE id = 1;", {
    $categoryId: categoryId,
  });
}

export async function setLastChannelId(channelId: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE live_tv_state SET last_channel_id = $channelId WHERE id = 1;", {
    $channelId: channelId,
  });
}
