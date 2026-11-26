import { describe, expect, it } from 'vitest';
import { describeConfig, q1, q2, q3, q4, q5, q6, q7, q8, report } from './answers';

// Locks the values written in ANSWERS.md. If an engine changes, these fail first.
describe('ANSWERS.md', () => {
  it('Q1: two of item C fit, cheese runs out first', () => {
    expect(q1()).toMatchObject({ max: 2, limitedBy: ['cheese'] });
  });

  it('Q2: the cheapest valid configuration costs 360.00 (Ketchup is free, so it ties)', () => {
    const answer = q2();
    expect(answer.unitPrice).toBe(36000);
    expect(answer.configs.map(describeConfig)).toEqual(['Toast + Fried x2 + Tofu', 'Toast + Fried x2 + Tofu + Ketchup']);
  });

  it('Q3: A x3 pays 1,040 at 10:30 (C2 capped) and 1,197 at 11:30 (no discount)', () => {
    const [morning, noon] = q3().map((p) => p.price);
    expect(morning).toMatchObject({ subtotal: 114000, cartDiscount: { id: 'C2', amount: 15000 }, vat: 4950, payable: 104000 });
    expect(noon).toMatchObject({ subtotal: 114000, cartDiscount: null, vat: 5700, payable: 119700 });
  });

  it('Q4: after TC-10 the cart pays 1,600 at 11:30', () => {
    expect(q4().price).toMatchObject({ subtotal: 162350, cartDiscount: { id: 'C1', amount: 10000 }, vat: 7618, payable: 160000 });
  });

  it('Q5: the six seed orders total 4,995', () => {
    const answer = q5();
    expect(answer.orders.map((o) => o.payable / 100)).toEqual([339, 713, 1271, 578, 866, 1228]);
    expect(answer.total.revenuePoisha).toBe(499500);
  });

  it('Q6: Fried sells the most units (10)', () => {
    const answer = q6();
    expect(answer.top).toEqual(['Fried']);
    expect(answer.ranking[0]).toMatchObject({ option: 'Fried', units: 10 });
  });

  it('Q7: card brings in the most revenue (2,145)', () => {
    expect(q7().methods[0]).toMatchObject({ method: 'card', revenuePoisha: 214500 });
  });

  it('Q8: 3 of the 4 orders with MORNING15 got it; ORD-1006 came after 11:00', () => {
    const { usage } = q8();
    expect(usage).toMatchObject({ entered: 4, applied: 3, appliedOrderIds: ['ORD-1001', 'ORD-1003', 'ORD-1005'] });
    expect(usage.notApplied).toEqual([{ orderId: 'ORD-1006', reason: 'expired' }]);
  });

  it('prints a report with every question', () => {
    const text = report();
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']) expect(text).toContain(`${q}.`);
  });
});
