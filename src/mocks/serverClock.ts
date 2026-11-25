/** The mock server's clock runs 90 seconds ahead of the browser (brief, Part D). */
export const SERVER_CLOCK_OFFSET_MS = 90_000;

let now = () => Date.now() + SERVER_CLOCK_OFFSET_MS;

/** Current server time in ms. Every expiry and promo check on the server uses this. */
export function serverNow(): number {
  return now();
}

/** Tests pin the server clock, e.g. to 10:59:59 Dhaka time. */
export function setServerNow(fn: () => number): void {
  now = fn;
}

export function resetServerNow(): void {
  now = () => Date.now() + SERVER_CLOCK_OFFSET_MS;
}
