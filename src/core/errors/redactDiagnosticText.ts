/**
 * Any link in a piece of diagnostic text, replaced by "[link]".
 *
 * A stream URL carries the account's username and password (in the path for
 * Xtream, sometimes in the query or the authority), and error messages quote
 * the URL they failed on. Anything shown on screen — the crash screen's
 * detail, the player monitor's last error — passes through this first, so a
 * credential is never rendered (AGENTS.md: "Never in SQLite, never in a log
 * line, never rendered"). The host goes too: the interface never names the
 * content source.
 *
 * Found by an outside review, 2026-11-25.
 */
const LINK = /\b(?:https?|rtmp|rtsp|rtp|udp|mms):\/\/[^\s"'<>]+/gi;

export function redactUrls(text: string): string {
  return text.replace(LINK, "[link]");
}
