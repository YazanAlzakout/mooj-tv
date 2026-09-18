import { Directory, DownloadTask, File, Paths, type DownloadPauseState } from "expo-file-system";
import { AppState } from "react-native";

import {
  deleteDownloadTask,
  getAllDownloadTasks,
  getDownloadByContent,
  insertDownloadTask,
  recoverInterruptedDownloads,
  updateDownloadProgress,
  updateDownloadStatus,
  type DownloadContentType,
  type DownloadTask as DownloadTaskRecord,
} from "@/db/repositories/downloadRepository";

import { clearDownloadProgress, setDownloadProgress } from "./downloadProgressStore";
import { resolveDownloadSourceUrl } from "./resolveSourceUrl";
import { isDownloadEligible } from "./eligibility";

export interface NewDownloadInput {
  id: string;
  contentType: DownloadContentType;
  providerItemId: string;
  providerId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  containerExtension: string;
  seriesId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
}

const PROGRESS_WRITE_THROTTLE_MS = 1000;

/** Live native tasks, keyed by download id. Empty after an app restart — resumeState (if any) rebuilds them lazily. */
const activeTasks = new Map<string, DownloadTask>();
const lastProgressWriteAt = new Map<string, number>();

/**
 * Closes a real race: `getDownloadByContent()` below is an async DB read,
 * so two rapid taps on the same Download button (before the first read
 * resolves) could both see "not downloading yet" and both call
 * `insertDownloadTask` + start a native transfer — two rows, two tasks,
 * both writing the same destination file concurrently. This set is
 * checked synchronously before any await, so the second call always loses.
 */
const startInFlight = new Set<string>();

function contentKey(contentType: DownloadContentType, providerItemId: string): string {
  return `${contentType}:${providerItemId}`;
}

function downloadsDirectory(): Directory {
  const dir = new Directory(Paths.document, "downloads");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

function destinationFile(item: Pick<NewDownloadInput, "contentType" | "providerItemId" | "containerExtension">): File {
  const name = `${item.contentType}_${sanitizeSegment(item.providerItemId)}.${sanitizeSegment(item.containerExtension)}`;
  return new File(downloadsDirectory(), name);
}

function onProgress(id: string) {
  return (data: { bytesWritten: number; totalBytes: number }) => {
    const totalBytes = data.totalBytes >= 0 ? data.totalBytes : null;
    setDownloadProgress(id, data.bytesWritten, totalBytes);

    const now = Date.now();
    const last = lastProgressWriteAt.get(id) ?? 0;
    if (now - last >= PROGRESS_WRITE_THROTTLE_MS) {
      lastProgressWriteAt.set(id, now);
      updateDownloadProgress(id, data.bytesWritten, totalBytes).catch(() => {});
    }
  };
}

async function runDownload(id: string, task: DownloadTask): Promise<void> {
  activeTasks.set(id, task);
  try {
    const file = await task.downloadAsync();
    if (file === null) {
      // Paused mid-transfer — pauseDownload() already persisted status/resumeState.
      return;
    }
    activeTasks.delete(id);
    clearDownloadProgress(id);
    await updateDownloadStatus(id, "completed", { localUri: file.uri });
  } catch (error) {
    activeTasks.delete(id);
    if (error instanceof Error && error.name === "AbortError") return; // cancelDownload() handles its own state.
    await updateDownloadStatus(id, "failed", {
      errorMessage: error instanceof Error ? error.message : "Download failed.",
    });
  }
}

export async function isAlreadyDownloaded(
  contentType: DownloadContentType,
  providerItemId: string
): Promise<DownloadTaskRecord | null> {
  return getDownloadByContent(contentType, providerItemId);
}

export function canDownload(containerExtension: string): boolean {
  return isDownloadEligible(containerExtension);
}

export async function startDownload(item: NewDownloadInput): Promise<void> {
  const key = contentKey(item.contentType, item.providerItemId);
  if (startInFlight.has(key)) return;
  startInFlight.add(key);

  try {
    const existing = await getDownloadByContent(item.contentType, item.providerItemId);
    if (existing) return; // already downloading/downloaded — nothing to do.

    await insertDownloadTask({
      id: item.id,
      contentType: item.contentType,
      providerItemId: item.providerItemId,
      providerId: item.providerId,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: item.imageUrl,
      containerExtension: item.containerExtension,
      status: "downloading",
      bytesTotal: null,
      seriesId: item.seriesId,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
    });

    const sourceUrl = await resolveDownloadSourceUrl(item);
    if (!sourceUrl) {
      await updateDownloadStatus(item.id, "failed", { errorMessage: "Provider credentials are unavailable." });
      return;
    }

    const file = destinationFile(item);
    const task = File.createDownloadTask(sourceUrl, file, { onProgress: onProgress(item.id) });
    runDownload(item.id, task);
  } finally {
    startInFlight.delete(key);
  }
}

export async function pauseDownload(id: string): Promise<void> {
  const task = activeTasks.get(id);
  if (!task) return;
  await task.pauseAsync();
  /*
   * `savable()` includes the request URL, which for this provider carries
   * the username and password in its path — so the URL is blanked before
   * the state is written and rebuilt on resume. Everything else in the
   * state (the destination, the headers, the byte range) is what actually
   * makes resuming possible.
   */
  const { url: _discardedCredentialUrl, ...state } = task.savable();
  activeTasks.delete(id);
  await updateDownloadStatus(id, "paused", { resumeState: JSON.stringify(state) });
}

export async function resumeDownload(record: DownloadTaskRecord): Promise<void> {
  if (activeTasks.has(record.id)) return;

  const sourceUrl = await resolveDownloadSourceUrl(record);
  if (!sourceUrl) {
    await updateDownloadStatus(record.id, "failed", { errorMessage: "Provider credentials are unavailable." });
    return;
  }

  if (record.resumeState) {
    try {
      const saved = JSON.parse(record.resumeState) as Omit<DownloadPauseState, "url">;
      const state: DownloadPauseState = { ...saved, url: sourceUrl };
      const task = DownloadTask.fromSavable(state, { onProgress: onProgress(record.id) });
      await updateDownloadStatus(record.id, "downloading", { resumeState: null });
      runDownload(record.id, task);
      return;
    } catch {
      // Fall through to a fresh restart below — saved resume data was unusable.
    }
  }

  // No usable resume state (e.g. the app was killed rather than gracefully
  // paused/backgrounded) — the only honest option is to restart the transfer.
  await updateDownloadStatus(record.id, "downloading", { resumeState: null });
  const file = destinationFile(record);
  const task = File.createDownloadTask(sourceUrl, file, { onProgress: onProgress(record.id) });
  runDownload(record.id, task);
}

export async function cancelDownload(id: string): Promise<void> {
  const task = activeTasks.get(id);
  if (task) {
    task.cancel();
    activeTasks.delete(id);
  }
  clearDownloadProgress(id);
  await deleteAndCleanupFile(id);
}

export async function deleteDownload(id: string): Promise<void> {
  const task = activeTasks.get(id);
  if (task) {
    task.cancel();
    activeTasks.delete(id);
  }
  clearDownloadProgress(id);
  await deleteAndCleanupFile(id);
}

async function deleteAndCleanupFile(id: string): Promise<void> {
  const records = await getAllDownloadTasks();
  const record = records.find((r) => r.id === id);
  if (record?.localUri) {
    try {
      const file = new File(record.localUri);
      if (file.exists) file.delete();
    } catch {
      // Best-effort cleanup — the DB row is still removed below either way.
    }
  }
  await deleteDownloadTask(id);
}

/**
 * Called once at app startup. Any row left in "downloading" was interrupted
 * by a process kill (a graceful pause already moved it to "paused" with
 * resumeState) — surface it as paused so the user can decide to resume
 * (restarting the transfer, since no resume data survives a hard kill).
 */
export async function recoverDownloadsOnBoot(): Promise<void> {
  await recoverInterruptedDownloads();
}

let backgroundListenerRegistered = false;

/** Pauses every active transfer when the app backgrounds, so resumeState is captured instead of lost to a later OS kill. */
export function registerDownloadBackgroundHandling(): void {
  if (backgroundListenerRegistered) return;
  backgroundListenerRegistered = true;
  AppState.addEventListener("change", (state) => {
    if (state !== "background" && state !== "inactive") return;
    for (const id of Array.from(activeTasks.keys())) {
      pauseDownload(id).catch(() => {});
    }
  });
}
