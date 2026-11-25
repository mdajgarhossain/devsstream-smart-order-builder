import { delay, http, HttpResponse, type AnyHandler } from 'msw';
import { priceCart } from '../domain/pricing';
import { chaos } from './chaos';
import { freeStock, menu, readState } from './db';
import { parseCartInput } from './parseCart';
import { serverNow } from './serverClock';

/** Every response carries the server time so the client can compute its clock offset. */
export function withServerTime<T extends object>(body: T) {
  return { ...body, serverTime: new Date(serverNow()).toISOString() };
}

function errorResponse(status: number, message: string) {
  return HttpResponse.json(withServerTime({ error: { message } }), { status });
}

export const handlers: AnyHandler[] = [
  // The whole menu (groups, options, rules, ingredients, promotions) plus the stock free right now.
  http.get('/api/menu', async () => {
    await delay(150);
    const state = readState();
    return HttpResponse.json(withServerTime({ menu, stock: freeStock(state) }));
  }),

  // Price preview. Slow and flaky on purpose; prices with the server clock.
  http.post('/api/price', async ({ request }) => {
    const body: unknown = await request.json().catch(() => null);
    await delay(chaos.priceLatencyMs());
    if (chaos.priceFails()) return errorResponse(503, 'Pricing service failed. Please retry.');

    const parsed = parseCartInput(body, menu);
    if (!parsed.ok) return errorResponse(400, parsed.message);

    const price = priceCart(parsed.cart, menu, menu.promotions, serverNow());
    return HttpResponse.json(withServerTime({ price }));
  }),
];
