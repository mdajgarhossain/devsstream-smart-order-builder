import { describe, expect, it } from 'vitest';
import { api } from '../api/client';
import { serverNow as clientServerNow } from '../api/serverTime';
import { readState, writeState } from './db';
import { SERVER_CLOCK_OFFSET_MS } from './serverClock';

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
