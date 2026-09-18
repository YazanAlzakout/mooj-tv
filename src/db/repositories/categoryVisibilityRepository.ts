import { getDatabase } from "@/db/client";

export type CategoryContentType = "live" | "movie" | "series";

/** Presence in the table means hidden; absence means visible (the default). */
export async function getHiddenCategoryIds(contentType: CategoryContentType): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category_id: string }>(
    "SELECT category_id FROM hidden_categories WHERE content_type = $contentType;",
    { $contentType: contentType }
  );
  return new Set(rows.map((r) => r.category_id));
}

export async function setCategoryHidden(
  contentType: CategoryContentType,
  categoryId: string,
  hidden: boolean
): Promise<void> {
  const db = await getDatabase();
  if (hidden) {
    await db.runAsync(
      "INSERT OR IGNORE INTO hidden_categories (content_type, category_id) VALUES ($contentType, $categoryId);",
      { $contentType: contentType, $categoryId: categoryId }
    );
  } else {
    await db.runAsync(
      "DELETE FROM hidden_categories WHERE content_type = $contentType AND category_id = $categoryId;",
      { $contentType: contentType, $categoryId: categoryId }
    );
  }
}
