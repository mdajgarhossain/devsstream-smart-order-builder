import { describe, expect, it } from 'vitest';
import { api, ApiError } from '../api/client';
import { ITEM_A, ITEM_B, ITEM_C } from '../test/fixtures';
import { chaos } from './chaos';
import { readState } from './db';
import { setServerNow } from './serverClock';

const dhaka = (time: string) => Date.parse(`2026-11-25T${time}+06:00`);

describe('seed orders', () => {
  it('are loaded on first start and priced with our engine at their own createdAt', async () => {
    const { orders } = await api.getOrders();

    expect(orders.map((o) => [o.id, o.source, o.totals.payable])).toEqual([
      ['ORD-1001', 'seed', 33900],
      ['ORD-1002', 'seed', 71300],
      ['ORD-1003', 'seed', 127100],
      ['ORD-1004', 'seed', 57800],
      ['ORD-1005', 'seed', 86600],
      ['ORD-1006', 'seed', 122800],
    ]);
  });

  it('record a coupon that was entered but not applied (ORD-1006 at 13:10)', async () => {
    const { orders } = await api.getOrders();
    const coupons = Object.fromEntries(orders.map((o) => [o.id, o.coupon]));

    expect(coupons['ORD-1001']).toEqual({ code: 'MORNING15', applied: true });
    expect(coupons['ORD-1002']).toBeNull();
    expect(coupons['ORD-1006']).toEqual({ code: 'MORNING15', applied: false, reason: 'expired' });
  });

  it('do not take anything from current stock', async () => {
    expect((await api.getCart()).stock).toMatchObject({ egg: 10, cheese: 4, croissant: 2 });
  });
});

describe('POST /api/checkout', () => {
  it('turns every active item into one order, prices it at Pay time and sells the stock', async () => {
    setServerNow(() => dhaka('10:59:59'));
    await api.addItem({ idempotencyKey: 'b', config: ITEM_B, qty: 1 });
    await api.addItem({ idempotencyKey: 'c', config: ITEM_C, qty: 2 });

    const { order, items, stock } = await api.checkout({ idempotencyKey: 'pay', paymentMethod: 'card', couponCode: 'MORNING15' });

    expect(order).toMatchObject({
      id: 'ORD-1007',
      source: 'checkout',
      paymentMethod: 'card',
      moneyUnit: 'poisha',
      coupon: { code: 'MORNING15', applied: true },
      totals: { subtotal: 165950, discount: { id: 'C2', amount: 15000 }, vat: 7548, payable: 158500 },
    });
    expect(order.createdAt).toBe(new Date(dhaka('10:59:59')).toISOString()); // server-made timestamp
    expect(order.lines).toHaveLength(2);
    expect(items).toEqual([]);
    expect(stock).toMatchObject({ egg: 0, cheese: 0, croissant: 1 });
    expect(readState().stock).toMatchObject({ egg: 0, cheese: 0, croissant: 1 }); // sold, not just reserved
  });

  it('TC-16 (server side): a repeated key returns the same order and sold stock is never released again', async () => {
    chaos.cartLatencyMs = () => 20;
    await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    const body = { idempotencyKey: 'pay-once', paymentMethod: 'bkash', couponCode: null };

    const [first, second] = await Promise.all([api.checkout(body), api.checkout(body)]);

    expect(first.order.id).toBe(second.order.id);
    expect(readState().orders).toHaveLength(7);
    expect(readState().stock.egg).toBe(8);

    // A new Pay attempt on the now-empty cart is refused and changes nothing.
    await expect(api.checkout({ ...body, idempotencyKey: 'another' })).rejects.toBeInstanceOf(ApiError);
    expect(readState().orders).toHaveLength(7);
    expect(readState().stock.egg).toBe(8);
  });

  it('only sells active items; expired ones are dropped without touching stock', async () => {
    setServerNow(() => dhaka('09:00:00'));
    await api.addItem({ idempotencyKey: 'old', config: ITEM_B, qty: 1 });
    setServerNow(() => dhaka('09:04:00'));
    await api.addItem({ idempotencyKey: 'new', config: ITEM_A, qty: 1 });
    setServerNow(() => dhaka('09:06:00')); // first item expired at 09:05

    const { order, items, stock } = await api.checkout({ idempotencyKey: 'p', paymentMethod: 'cash', couponCode: null });

    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]?.options).toEqual(ITEM_A);
    expect(items).toEqual([]);
    expect(stock.egg).toBe(8);
    expect(stock.croissant).toBe(2);
  });

  it('rejects an unknown payment method', async () => {
    await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    await expect(api.checkout({ idempotencyKey: 'p', paymentMethod: 'crypto', couponCode: null })).rejects.toMatchObject({ status: 400 });
    expect(readState().reservations).toHaveLength(1);
  });
});
