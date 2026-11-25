import { delay, http, HttpResponse, type AnyHandler } from 'msw';
import { freeStock, menu, readState } from './db';
import { serverNow } from './serverClock';

/** Every response carries the server time so the client can compute its clock offset. */
export function withServerTime<T extends object>(body: T) {
  return { ...body, serverTime: new Date(serverNow()).toISOString() };
}

export const handlers: AnyHandler[] = [
  // The whole menu (groups, options, rules, ingredients, promotions) plus the stock free right now.
  http.get('/api/menu', async () => {
    await delay(150);
    const state = readState();
    return HttpResponse.json(withServerTime({ menu, stock: freeStock(state) }));
  }),
];
