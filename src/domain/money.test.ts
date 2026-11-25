import { describe, expect, it } from 'vitest';
import { divideHalfUp, formatBdt, percentOf, roundToWholeBdt } from './money';
import { dateIn, parseClock, secondsOfDay } from './time';

describe('money', () => {
  it('rounds half-up with integers only', () => {
    expect(divideHalfUp(15, 2)).toBe(8);
    expect(divideHalfUp(14, 4)).toBe(4); // 3.5 -> 4
    expect(divideHalfUp(13, 4)).toBe(3); // 3.25 -> 3
  });

  it('gets the boundary VAT cases right where floats fail', () => {
    expect(percentOf(150950, 5)).toBe(7548); // 75.475 -> 75.48 (float gives 75.47)
    expect(percentOf(155950, 5)).toBe(7798); // 77.975 -> 77.98
    expect(percentOf(165950, 15)).toBe(24893); // 248.925 -> 248.93
  });

  it('rounds the payable to whole BDT, half-up', () => {
    expect(roundToWholeBdt(158498)).toBe(158500);
    expect(roundToWholeBdt(163748)).toBe(163700);
    expect(roundToWholeBdt(103950)).toBe(104000);
  });

  it('formats poisha as BDT', () => {
    expect(formatBdt(67950)).toBe('679.50');
    expect(formatBdt(165950)).toBe('1,659.50');
    expect(formatBdt(5)).toBe('0.05');
    expect(formatBdt(-1500)).toBe('-15.00');
  });
});

describe('time in Asia/Dhaka', () => {
  it('reads the local clock regardless of the machine time zone', () => {
    expect(secondsOfDay(Date.parse('2026-11-25T10:59:59+06:00'), 'Asia/Dhaka')).toBe(parseClock('10:59') + 59);
    expect(secondsOfDay(Date.parse('2026-11-25T05:00:00Z'), 'Asia/Dhaka')).toBe(parseClock('11:00'));
  });

  it('gives the Dhaka calendar date', () => {
    expect(dateIn(Date.parse('2026-11-20T23:30:00Z'), 'Asia/Dhaka')).toBe('2026-11-21');
  });
});
