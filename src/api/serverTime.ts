/**
 * The browser's view of server time.
 * Each API response carries `serverTime`; we keep offset = serverTime - Date.now()
 * so countdowns and expiries follow the server clock, not the local one.
 * (Network latency of the response is ignored: it is well under a second here.)
 */
let offsetMs = 0;

export function syncServerTime(serverTimeIso: string): void {
  const serverMs = Date.parse(serverTimeIso);
  if (!Number.isNaN(serverMs)) offsetMs = serverMs - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function serverOffsetMs(): number {
  return offsetMs;
}
