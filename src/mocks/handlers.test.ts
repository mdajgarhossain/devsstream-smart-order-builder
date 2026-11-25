import { describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { serverNow as clientServerNow } from '../api/serverTime';
import { ITEM_B, ITEM_C } from '../test/fixtures';
import { chaos } from './chaos';
import { readState, writeState } from './db';
import { SERVER_CLOCK_OFFSET_MS, setServerNow } from './serverClock';

describe('POST /api/price', () => {
  const tc06Cart = { lines: [{ config: ITEM_B, qty: 1 }, { config: ITEM_C, qty: 2 }], couponCode: 'MORNING15' };

  it('prices with the server clock (coupon valid at 10:59:59, not at 11:00:00)', async () => {
    setServerNow(() => Date.parse('2026-11-25T10:59:59+06:00'));
    expect((await api.price(tc06Cart)).price).toMatchObject({ payable: 158500, coupon: { applied: true } });

    setServerNow(() => Date.parse('2026-11-25T11:00:00+06:00'));
    expect((await api.price(tc06Cart)).price).toMatchObject({ payable: 163700, coupon: { applied: false } });
  });

  it('rejects unknown options and bad quantities', async () => {
    await expect(api.price({ lines: [{ config: { pancake: 1 }, qty: 1 }] })).rejects.toMatchObject({ status: 400 });
    await expect(api.price({ lines: [{ config: ITEM_B, qty: 4 }] })).rejects.toMatchObject({ status: 400 });
  });

  it('fails like a flaky service when chaos says so', async () => {
    chaos.priceFails = () => true;
    await expect(api.price(tc06Cart)).rejects.toMatchObject({ status: 503 });
  });
});

describe('GET /api/menu', () => {
  it('serves the whole menu fixture and the free stock', async () => {
    const { menu, stock } = await api.getMenu();

    expect(menu.groups.map((g) => g.id)).toEqual(['bread', 'eggs', 'protein', 'extras', 'sauce']);
    expect(menu.rules).toHaveLength(4);
    expect(stock).toMatchObject({ egg: 10, cheese: 4, croissant: 2 });
  });

  it('reports server time 90 s ahead, and the client adopts it', async () => {
    const { serverTime } = await api.getMenu();

    expect(Date.parse(serverTime) - Date.now()).toBeGreaterThan(SERVER_CLOCK_OFFSET_MS - 2_000);
    expect(Math.abs(clientServerNow() - Date.parse(serverTime))).toBeLessThan(2_000);
  });

  it('reads stock from the shared store on every request', async () => {
    writeState({ ...readState(), stock: { ...readState().stock, egg: 3 } });

    const { stock } = await api.getMenu();

    expect(stock.egg).toBe(3);
  });
});
