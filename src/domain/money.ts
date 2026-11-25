import type { Poisha } from './types';

/** n / d rounded half-up, using integers only (n >= 0, d > 0). 15 / 2 -> 8 */
export function divideHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/** percent% of an amount, rounded half-up to the nearest poisha. 5% of 150950 -> 7548 */
export function percentOf(amount: Poisha, percent: number): Poisha {
  return divideHalfUp(amount * percent, 100);
}

/** Round to whole BDT, half-up. 158498 (1,584.98) -> 158500 (1,585.00) */
export function roundToWholeBdt(amount: Poisha): Poisha {
  return divideHalfUp(amount, 100) * 100;
}

/** 67950 -> "679.50". Integer maths only, no float division. */
export function formatBdt(amount: Poisha): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const taka = Math.trunc(abs / 100);
  const poisha = abs % 100;
  return `${sign}${taka.toLocaleString('en-US')}.${String(poisha).padStart(2, '0')}`;
}
