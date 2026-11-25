import { describe, expect, it } from 'vitest';
import { priceCart } from './pricing';
import { ITEM_A, ITEM_B, ITEM_C, menu } from '../test/fixtures';
import type { Promotion } from './types';

const dhaka = (time: string) => Date.parse(`2026-11-25T${time}+06:00`);

describe('priceCart - per unit', () => {
  it('shows each step for B: 755.00 - combo 75.50 = 679.50', () => {
    const [line] = priceCart({ lines: [{ config: ITEM_B, qty: 1 }] }, menu, menu.promotions, dhaka('09:00:00')).lines;

    expect(line).toEqual({
      qty: 1,
      unitSubtotal: 75500,
      unitDiscounts: [{ id: 'P1', name: 'Combo', amount: 7550 }],
      unitPrice: 67950,
      lineTotal: 67950,
    });
  });

  it('gives C the cheapest of its 4 extras free (Baked Beans, 25.00)', () => {
    const [line] = priceCart({ lines: [{ config: ITEM_C, qty: 2 }] }, menu, menu.promotions, 0).lines;

    expect(line?.unitDiscounts).toEqual([{ id: 'P2', name: 'Extras deal', amount: 2500 }]);
    expect(line?.lineTotal).toBe(98000);
  });

  it('applies the combo to the amount after the extras deal (step 3 after step 2)', () => {
    // 6 extras would break the group max, but pricing does not validate: it only follows the steps.
    const config = { toast: 1, scrambled: 2, fried: 2, sausage: 2, hashbrown: 3, mushroom: 3 };
    const [line] = priceCart({ lines: [{ config, qty: 1 }] }, menu, menu.promotions, 0).lines;

    // 250 + 70 + 60 + 120 + 120 + 90 = 710; 2 free cheapest (mushroom 30 x2) -> 650; 10% of 650 = 65 -> 585
    expect(line?.unitDiscounts.map((d) => [d.id, d.amount])).toEqual([
      ['P2', 6000],
      ['P1', 6500],
    ]);
    expect(line?.unitPrice).toBe(58500);
  });

  it('counts egg units, not eggs, for the combo (Omelette x2 is 2 units)', () => {
    const [line] = priceCart(
      { lines: [{ config: { toast: 1, omelette: 2, sausage: 1, bacon: 1 }, qty: 1 }] },
      menu,
      menu.promotions,
      0,
    ).lines;
    expect(line?.unitDiscounts).toEqual([]);
  });

  it('prices the TC-10 edit of B at 643.50', () => {
    const edited = { ...ITEM_B, omelette: 1, fried: 3 };
    expect(priceCart({ lines: [{ config: edited, qty: 1 }] }, menu, menu.promotions, 0).lines[0]?.unitPrice).toBe(64350);
  });
});

describe('priceCart - cart discounts and VAT', () => {
  it('Q3: A x3 at 10:30 takes C2 (capped at 150) and pays 1,040', () => {
    const result = priceCart({ lines: [{ config: ITEM_A, qty: 3 }], couponCode: 'MORNING15' }, menu, menu.promotions, dhaka('10:30:00'));

    expect(result.subtotal).toBe(114000);
    expect(result.eligibleDiscounts.map((d) => d.id)).toEqual(['C2']); // below the C1 threshold
    expect(result.cartDiscount).toMatchObject({ id: 'C2', amount: 15000 });
    expect(result.vat).toBe(4950);
    expect(result.total).toBe(103950);
    expect(result.payable).toBe(104000); // 1,039.50 rounds half-up
  });

  it('Q3: A x3 at 11:30 has no discount and pays 1,197', () => {
    const result = priceCart({ lines: [{ config: ITEM_A, qty: 3 }], couponCode: 'MORNING15' }, menu, menu.promotions, dhaka('11:30:00'));

    expect(result.cartDiscount).toBeNull();
    expect(result.vat).toBe(5700);
    expect(result.payable).toBe(119700);
  });

  it('gives a tie to the first id in the tie-break list (C1)', () => {
    const promos: Promotion[] = menu.promotions.map((p) => (p.type === 'cartThreshold' ? { ...p, amountOff: 15000 } : p));
    const result = priceCart(
      { lines: [{ config: ITEM_B, qty: 1 }, { config: ITEM_C, qty: 2 }], couponCode: 'MORNING15' },
      menu,
      promos,
      dhaka('10:00:00'),
    );

    expect(result.cartDiscount).toMatchObject({ id: 'C1', amount: 15000 });
    expect(result.coupon).toEqual({ code: 'MORNING15', applied: false, reason: 'notBest' });
  });

  it('reports an unknown coupon and matches codes case-insensitively', () => {
    const lines = [{ config: ITEM_A, qty: 1 }];
    expect(priceCart({ lines, couponCode: 'SAVE50' }, menu, menu.promotions, dhaka('09:00:00')).coupon).toEqual({
      code: 'SAVE50',
      applied: false,
      reason: 'unknown',
    });
    expect(priceCart({ lines, couponCode: ' morning15 ' }, menu, menu.promotions, dhaka('09:00:00')).coupon?.applied).toBe(true);
  });

  it('prices an empty cart at zero', () => {
    expect(priceCart({ lines: [] }, menu, menu.promotions, 0)).toMatchObject({ subtotal: 0, vat: 0, payable: 0 });
  });
});
