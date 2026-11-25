/**
 * Simulated network trouble for /price (brief: 200-1500 ms latency, 15% random failure).
 * Kept in one object so tests can make it deterministic.
 */
export const chaos = {
  priceLatencyMs: (): number => 200 + Math.floor(Math.random() * 1301),
  priceFails: (): boolean => Math.random() < 0.15,
};

const defaults = { ...chaos };

/** Tests: no latency, no random failures. */
export function calmChaos(): void {
  chaos.priceLatencyMs = () => 0;
  chaos.priceFails = () => false;
}

export function resetChaos(): void {
  Object.assign(chaos, defaults);
}
