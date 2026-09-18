import { getDatabase } from "@/db/client";

export type DownloadContentType = "movie" | "episode";
export type DownloadStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";

export interface DownloadTask {
  id: string;
  contentType: DownloadContentType;
  providerItemId: string;
  providerId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  containerExtension: string;
  localUri: string | null;
  status: DownloadStatus;
  bytesDownloaded: number;
  bytesTotal: number | null;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  createdAt: number;
  updatedAt: number;
  errorMessage: string | null;
  /** Serialized `DownloadPauseState` from expo-file-system, captured on an intentional pause. */
  resumeState: string | null;
}

interface DownloadTaskRow {
  id: string;
  content_type: DownloadContentType;
  provider_item_id: string;
  provider_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  container_extension: string;
  local_uri: string | null;
  status: DownloadStatus;
  bytes_downloaded: number;
  bytes_total: number | null;
  series_id: string | null;
  season_number: number | null;
  episode_number: number | null;
  created_at: number;
  updated_at: number;
  error_message: string | null;
  resume_state: string | null;
}

function fromRow(row: DownloadTaskRow): DownloadTask {
  return {
    id: row.id,
    contentType: row.content_type,
    providerItemId: row.provider_item_id,
    providerId: row.provider_id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
    containerExtension: row.container_extension,
    localUri: row.local_uri,
    status: row.status,
    bytesDownloaded: row.bytes_downloaded,
    bytesTotal: row.bytes_total,
    seriesId: row.series_id,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    resumeState: row.resume_state,
  };
}

export async function insertDownloadTask(
  task: Omit<DownloadTask, "createdAt" | "updatedAt" | "bytesDownloaded" | "localUri" | "errorMessage" | "resumeState">
): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO download_tasks
      (id, content_type, provider_item_id, provider_id, title, subtitle, image_url, container_extension,
       source_url, local_uri, status, bytes_downloaded, bytes_total, series_id, season_number, episode_number,
       created_at, updated_at, error_message, resume_state)
     VALUES
      ($id, $contentType, $providerItemId, $providerId, $title, $subtitle, $imageUrl, $containerExtension,
       '', NULL, $status, 0, $bytesTotal, $seriesId, $seasonNumber, $episodeNumber,
       $createdAt, $updatedAt, NULL, NULL);`,
    {
      $id: task.id,
      $contentType: task.contentType,
      $providerItemId: task.providerItemId,
      $providerId: task.providerId,
      $title: task.title,
      $subtitle: task.subtitle,
      $imageUrl: task.imageUrl,
      $containerExtension: task.containerExtension,
      $status: task.status,
      $bytesTotal: task.bytesTotal,
      $seriesId: task.seriesId,
      $seasonNumber: task.seasonNumber,
      $episodeNumber: task.episodeNumber,
      $createdAt: now,
      $updatedAt: now,
    }
  );
}

export async function updateDownloadProgress(
  id: string,
  bytesDownloaded: number,
  bytesTotal: number | null
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_tasks SET bytes_downloaded = $bytesDownloaded, bytes_total = $bytesTotal, updated_at = $now WHERE id = $id;",
    { $id: id, $bytesDownloaded: bytesDownloaded, $bytesTotal: bytesTotal, $now: Date.now() }
  );
}

export async function updateDownloadStatus(
  id: string,
  status: DownloadStatus,
  options: { localUri?: string | null; errorMessage?: string | null; resumeState?: string | null } = {}
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE download_tasks SET status = $status, updated_at = $now
     ${options.localUri !== undefined ? ", local_uri = $localUri" : ""}
     ${options.errorMessage !== undefined ? ", error_message = $errorMessage" : ""}
     ${options.resumeState !== undefined ? ", resume_state = $resumeState" : ""}
     WHERE id = $id;`,
    {
      $id: id,
      $status: status,
      $now: Date.now(),
      ...(options.localUri !== undefined ? { $localUri: options.localUri } : {}),
      ...(options.errorMessage !== undefined ? { $errorMessage: options.errorMessage } : {}),
      ...(options.resumeState !== undefined ? { $resumeState: options.resumeState } : {}),
    }
  );
}

export async function deleteDownloadTask(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM download_tasks WHERE id = $id;", { $id: id });
}

export async function getDownloadTask(id: string): Promise<DownloadTask | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadTaskRow>("SELECT * FROM download_tasks WHERE id = $id;", { $id: id });
  return row ? fromRow(row) : null;
}

export async function getDownloadByContent(
  contentType: DownloadContentType,
  providerItemId: string
): Promise<DownloadTask | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadTaskRow>(
    "SELECT * FROM download_tasks WHERE content_type = $contentType AND provider_item_id = $providerItemId;",
    { $contentType: contentType, $providerItemId: providerItemId }
  );
  return row ? fromRow(row) : null;
}

export async function getAllDownloadTasks(): Promise<DownloadTask[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DownloadTaskRow>("SELECT * FROM download_tasks ORDER BY created_at DESC;");
  return rows.map(fromRow);
}

/** Any task still marked "downloading" when the app starts was interrupted mid-transfer (process kill, crash). */
export async function recoverInterruptedDownloads(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "UPDATE download_tasks SET status = 'paused', updated_at = $now WHERE status = 'downloading';",
    { $now: Date.now() }
  );
}

export async function getDownloadsSummary(): Promise<{ count: number; totalBytes: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number; total_bytes: number | null }>(
    "SELECT COUNT(*) as count, SUM(bytes_downloaded) as total_bytes FROM download_tasks WHERE status = 'completed';"
  );
  return { count: row?.count ?? 0, totalBytes: row?.total_bytes ?? 0 };
}
