/**
 * Simulated trouble, kept in one object so tests can make it deterministic.
 * - /price: 200-1500 ms latency and a 15% random failure (from the brief).
 * - cart calls: a little latency so double clicks really race.
 * - reserveCrashes: lets tests make a reservation fail half-way (TC-14). Off by default.
 */
export const chaos = {
  priceLatencyMs: (): number => 200 + Math.floor(Math.random() * 1301),
  priceFails: (): boolean => Math.random() < 0.15,
  cartLatencyMs: (): number => 150 + Math.floor(Math.random() * 250),
  reserveCrashes: (): boolean => false,
};

const defaults = { ...chaos };

/** Tests: no latency, no random failures. */
export function calmChaos(): void {
  chaos.priceLatencyMs = () => 0;
  chaos.priceFails = () => false;
  chaos.cartLatencyMs = () => 0;
  chaos.reserveCrashes = () => false;
}

export function resetChaos(): void {
  Object.assign(chaos, defaults);
}
