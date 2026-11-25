import { describe, expect, it } from 'vitest';
import { api, ApiError, type ApiErrorBody } from '../api/client';
import { ITEM_A, ITEM_B, ITEM_C } from '../test/fixtures';
import { chaos } from './chaos';
import { readState } from './db';
import { setServerNow } from './serverClock';

const shortMessage = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof ApiError ? { status: error.status, message: error.message, code: (error.body as ApiErrorBody).error?.code } : error;
  }
  throw new Error('expected the request to fail');
};

describe('cart API', () => {
  it('reserves every ingredient of an item and reports free stock', async () => {
    const { item, stock, items } = await api.addItem({ idempotencyKey: 'k1', config: ITEM_B, qty: 1 });

    expect(items).toHaveLength(1);
    expect(item.usage).toMatchObject({ egg: 6, croissant: 1 });
    expect(stock).toMatchObject({ egg: 4, croissant: 1 });
  });

  it('TC-13 (server side): the same idempotency key creates exactly one item', async () => {
    chaos.cartLatencyMs = () => 20;
    const body = { idempotencyKey: 'same-key', config: ITEM_A, qty: 1 };

    const results = await Promise.all([api.addItem(body), api.addItem(body), api.addItem(body)]);

    expect(new Set(results.map((r) => r.item.id)).size).toBe(1);
    expect(readState().reservations).toHaveLength(1);
    expect((await api.getCart()).stock.egg).toBe(8);
  });

  it('rejects a configuration that breaks the rules, and one that does not fit', async () => {
    expect(await shortMessage(api.addItem({ idempotencyKey: 'k1', config: { toast: 1, scrambled: 3, sausage: 1 }, qty: 1 }))).toMatchObject({
      status: 422,
      code: 'rules',
    });

    await api.addItem({ idempotencyKey: 'k2', config: ITEM_B, qty: 1 });
    await api.addItem({ idempotencyKey: 'k3', config: ITEM_C, qty: 2 });
    expect(await shortMessage(api.addItem({ idempotencyKey: 'k4', config: ITEM_C, qty: 1 }))).toMatchObject({
      status: 409,
      message: 'Short: 2 egg, 2 cheese',
    });
  });

  it('TC-14 (server side): a reservation that fails half-way holds nothing, and a retry works', async () => {
    chaos.reserveCrashes = () => true;
    const body = { idempotencyKey: 'retry-key', config: ITEM_B, qty: 1 };

    expect(await shortMessage(api.addItem(body))).toMatchObject({ status: 500 });
    expect(readState().reservations).toEqual([]);
    expect(readState().idempotency).toEqual({});
    expect((await api.getCart()).stock.egg).toBe(10);

    chaos.reserveCrashes = () => false;
    const { items, stock } = await api.addItem(body);
    expect(items).toHaveLength(1);
    expect(stock.egg).toBe(4);
  });

  it('edits on the net difference in one call (TC-09 / TC-10 on the server)', async () => {
    const { item: b } = await api.addItem({ idempotencyKey: 'b', config: ITEM_B, qty: 1 });
    await api.addItem({ idempotencyKey: 'c', config: ITEM_C, qty: 2 });

    expect(await shortMessage(api.updateItem(b.id, { config: { ...ITEM_B, omelette: 3, fried: 1 }, qty: 1 }))).toMatchObject({
      status: 409,
      message: 'Short: 1 egg',
    });
    expect((await api.getCart()).items.find((i) => i.id === b.id)?.usage.egg).toBe(6); // untouched

    const { stock, item } = await api.updateItem(b.id, { config: { ...ITEM_B, omelette: 1, fried: 3 }, qty: 1 });
    expect(stock.egg).toBe(1);
    expect(item.expiresAt).toBe(b.expiresAt); // editing does not extend the reservation
  });

  it('D1: when another tab took the last eggs, the save is rejected with the shortage and nothing changes', async () => {
    const { item: tabAItem } = await api.addItem({ idempotencyKey: 'tab-a', config: ITEM_A, qty: 1 }); // 2 eggs
    await api.addItem({ idempotencyKey: 'tab-b', config: { ...ITEM_A, scrambled: 6 }, qty: 1 }); // 6 eggs
    await api.addItem({ idempotencyKey: 'tab-b-2', config: ITEM_A, qty: 1 }); // last 2 eggs

    const result = await shortMessage(api.updateItem(tabAItem.id, { config: { ...ITEM_A, scrambled: 4 }, qty: 1 }));

    expect(result).toMatchObject({ status: 409, code: 'shortage', message: 'Short: 2 egg' });
    expect(readState().reservations.find((r) => r.id === tabAItem.id)?.usage.egg).toBe(2);
  });

  it('expires after 5 minutes of server time: stock released, item read-only, still removable', async () => {
    const start = Date.parse('2026-11-25T09:00:00+06:00');
    setServerNow(() => start);
    const { item } = await api.addItem({ idempotencyKey: 'k', config: ITEM_B, qty: 1 });
    expect(item.expiresAt).toBe(start + 300_000);

    setServerNow(() => start + 299_999);
    expect((await api.getCart()).items[0]?.status).toBe('active');

    setServerNow(() => start + 300_000);
    const cart = await api.getCart();
    expect(cart.items[0]?.status).toBe('expired');
    expect(cart.stock.egg).toBe(10);

    expect(await shortMessage(api.updateItem(item.id, { config: ITEM_B, qty: 1 }))).toMatchObject({ status: 410, code: 'expired' });
    expect((await api.removeItem(item.id)).items).toEqual([]);
  });
});
