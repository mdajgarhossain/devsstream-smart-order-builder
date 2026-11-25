import { describe, expect, it } from 'vitest';
import { priceCart } from '../../domain/pricing';
import { ITEM_A, ITEM_B, ITEM_C, menu } from '../fixtures';

/** A moment on 25 Nov 2026 in Asia/Dhaka, e.g. dhaka('10:59:59'). */
const dhaka = (time: string) => Date.parse(`2026-11-25T${time}+06:00`);
const price = (lines: Parameters<typeof priceCart>[0]['lines'], couponCode: string | null, at: string) =>
  priceCart({ lines, couponCode }, menu, menu.promotions, dhaka(at));

describe('Section 9 - Part C pricing', () => {
  it('TC-05: unit prices A = 380.00, B = 679.50, C = 490.00', () => {
    const result = price([{ config: ITEM_A, qty: 1 }, { config: ITEM_B, qty: 1 }, { config: ITEM_C, qty: 1 }], null, '09:00:00');

    expect(result.lines.map((line) => line.unitPrice)).toEqual([38000, 67950, 49000]);
  });

  it('TC-06: cart B x1 + C x2 at 10:59:59 with the coupon - C2 wins, VAT 75.48, payable 1,585', () => {
    const result = price([{ config: ITEM_B, qty: 1 }, { config: ITEM_C, qty: 2 }], 'MORNING15', '10:59:59');

    expect(result.subtotal).toBe(165950);
    expect(result.eligibleDiscounts).toEqual([
      expect.objectContaining({ id: 'C1', amount: 10000 }),
      expect.objectContaining({ id: 'C2', amount: 15000 }),
    ]);
    expect(result.cartDiscount).toMatchObject({ id: 'C2', amount: 15000 });
    expect(result.coupon).toEqual({ code: 'MORNING15', applied: true });
    expect(result.vat).toBe(7548);
    expect(result.payable).toBe(158500);
  });

  it('TC-07: same cart at 11:00:00 - coupon rejected, C1 = 100.00, VAT 77.98, payable 1,637', () => {
    const result = price([{ config: ITEM_B, qty: 1 }, { config: ITEM_C, qty: 2 }], 'MORNING15', '11:00:00');

    expect(result.coupon).toEqual({ code: 'MORNING15', applied: false, reason: 'expired' });
    expect(result.cartDiscount).toMatchObject({ id: 'C1', amount: 10000 });
    expect(result.vat).toBe(7798);
    expect(result.payable).toBe(163700);
  });
});
