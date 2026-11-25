/** Seconds since local midnight in a time zone, e.g. 10:59:59 in Asia/Dhaka -> 39599. */
export function secondsOfDay(timeMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timeMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 3600 + get('minute') * 60 + get('second');
}

/** "11:00" -> 39600 */
export function parseClock(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 3600 + m * 60;
}

/** Calendar date in a time zone, "YYYY-MM-DD". */
export function dateIn(timeMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(timeMs),
  );
}
