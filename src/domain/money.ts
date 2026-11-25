import type { Poisha } from './types';

/** 67950 -> "679.50". Integer maths only, no float division. */
export function formatBdt(amount: Poisha): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const taka = Math.trunc(abs / 100);
  const poisha = abs % 100;
  return `${sign}${taka.toLocaleString('en-US')}.${String(poisha).padStart(2, '0')}`;
}
