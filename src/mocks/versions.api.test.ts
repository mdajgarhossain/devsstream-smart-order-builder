import { describe, expect, it } from 'vitest';
import { api, ApiError, type ApiErrorBody, type CartResponse } from '../api/client';
import { ITEM_A, ITEM_B } from '../test/fixtures';
import { readState } from './db';
import { setServerNow } from './serverClock';

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const body = error.body as ApiErrorBody & Partial<CartResponse>;
    return { status: error.status, code: body.error?.code, message: error.message, items: body.items, version: body.version };
  }
  throw new Error('expected the request to fail');
};

describe('Part G (server): versions and conflicts', () => {
  it('every cart change moves the cart version on; each edit moves the item version on', async () => {
    const empty = await api.getCart();
    expect(empty.version).toBe(0);

    const added = await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    expect(added.version).toBe(1);
    expect(added.item.version).toBe(1);

    const edited = await api.updateItem(added.item.id, { config: ITEM_A, qty: 2, baseVersion: 1 });
    expect(edited.item.version).toBe(2);
    expect(edited.version).toBe(2);

    const removed = await api.removeItem(added.item.id, 2);
    expect(removed.version).toBe(3);
  });

  it('a stale tab editing an item another tab already changed gets 409 and the fresh cart, nothing is overwritten', async () => {
    const { item } = await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    await api.updateItem(item.id, { config: ITEM_A, qty: 2, baseVersion: 1 }); // tab B

    const result = await failure(api.updateItem(item.id, { config: ITEM_A, qty: 3, baseVersion: 1 })); // tab A, stale

    expect(result).toMatchObject({ status: 409, code: 'version_conflict' });
    expect(result.items?.[0]).toMatchObject({ qty: 2, version: 2 }); // the reload data comes with the error
    expect(readState().reservations[0]).toMatchObject({ qty: 2, version: 2 });
  });

  it('a stale tab removing an item another tab changed gets 409 and the item stays', async () => {
    const { item } = await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    await api.updateItem(item.id, { config: ITEM_A, qty: 2, baseVersion: 1 });

    expect(await failure(api.removeItem(item.id, 1))).toMatchObject({ status: 409, code: 'version_conflict' });
    expect(readState().reservations).toHaveLength(1);
  });

  it('adding an unrelated item does not conflict with an edit (D1 still gets its shortage message)', async () => {
    const { item } = await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    await api.addItem({ idempotencyKey: 'b', config: ITEM_B, qty: 1 }); // another tab

    const edited = await api.updateItem(item.id, { config: ITEM_A, qty: 2, baseVersion: 1 });
    expect(edited.item.qty).toBe(2);
  });

  it('Pay with an old cart version is refused and no order is made', async () => {
    const { version } = await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    await api.addItem({ idempotencyKey: 'b', config: ITEM_B, qty: 1 }); // another tab adds B

    const result = await failure(api.checkout({ idempotencyKey: 'pay', paymentMethod: 'card', couponCode: null, baseVersion: version }));

    expect(result).toMatchObject({ status: 409, code: 'version_conflict' });
    expect(result.items).toHaveLength(2);
    expect(readState().orders).toHaveLength(6);

    const paid = await api.checkout({ idempotencyKey: 'pay', paymentMethod: 'card', couponCode: null, baseVersion: result.version });
    expect(paid.order.lines).toHaveLength(2);
  });

  it('a repeated Pay that already went through returns its order, even though the version moved on', async () => {
    const { version } = await api.addItem({ idempotencyKey: 'a', config: ITEM_A, qty: 1 });
    const body = { idempotencyKey: 'pay', paymentMethod: 'card', couponCode: null, baseVersion: version };

    const first = await api.checkout(body);
    const again = await api.checkout(body);

    expect(again.order.id).toBe(first.order.id);
  });

  it('page load drops expired items and keeps the live ones', async () => {
    const start = Date.parse('2026-11-25T09:00:00+06:00');
    setServerNow(() => start);
    await api.addItem({ idempotencyKey: 'old', config: ITEM_B, qty: 1 });
    setServerNow(() => start + 200_000);
    await api.addItem({ idempotencyKey: 'new', config: ITEM_A, qty: 1 });

    setServerNow(() => start + 300_000); // B expired, A still has 100 s
    const before = await api.getCart();
    expect(before.items.map((i) => i.status)).toEqual(['expired', 'active']);

    const after = await api.dropExpired();
    expect(after.items.map((i) => i.config)).toEqual([ITEM_A]);
    expect(after.version).toBe(before.version + 1);
    expect(after.stock.egg).toBe(8);
  });
});
