import { delay, http, HttpResponse, type AnyHandler } from 'msw';
import { priceCart } from '../domain/pricing';
import { cartSnapshot, editItem, removeItem, reserveItem, type ServiceError } from './cartService';
import { chaos } from './chaos';
import { freeStock, menu, releaseExpired, updateState } from './db';
import { parseCartInput } from './parseCart';
import { serverNow } from './serverClock';

/** Every response carries the server time so the client can compute its clock offset. */
export function withServerTime<T extends object>(body: T) {
  return { ...body, serverTime: new Date(serverNow()).toISOString() };
}

function errorResponse(status: number, message: string, extra: Partial<ServiceError> | { code: string } = {}) {
  return HttpResponse.json(withServerTime({ error: { ...extra, message } }), { status });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

export const handlers: AnyHandler[] = [
  // The whole menu (groups, options, rules, ingredients, promotions) plus the stock free right now.
  http.get('/api/menu', async () => {
    await delay(150);
    const stock = updateState((state) => {
      releaseExpired(state, serverNow());
      return freeStock(state);
    });
    return HttpResponse.json(withServerTime({ menu, stock }));
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

  // Cart = the reservations. Expired ones are released on every read.
  http.get('/api/cart', async () => {
    await delay(chaos.cartLatencyMs());
    const snapshot = updateState((state) => {
      releaseExpired(state, serverNow());
      return cartSnapshot(state);
    });
    return HttpResponse.json(withServerTime(snapshot));
  }),

  // Add to cart: atomic reservation + idempotency key.
  http.post('/api/cart/items', async ({ request }) => {
    const body = await readBody(request);
    await delay(chaos.cartLatencyMs());
    try {
      const result = updateState((state) => {
        const now = serverNow();
        releaseExpired(state, now);
        const outcome = reserveItem(state, body, now);
        return { outcome, snapshot: cartSnapshot(state) };
      });
      if (!result.outcome.ok) return errorResponse(result.outcome.error.status, result.outcome.error.message, result.outcome.error);
      const { item, created } = result.outcome.value;
      return HttpResponse.json(withServerTime({ item, ...result.snapshot }), { status: created ? 201 : 200 });
    } catch {
      return errorResponse(500, 'Could not reserve this item. Nothing was held, please retry.', { code: 'server_error' });
    }
  }),

  // Edit: one call that swaps the old allocation for the new one.
  http.put('/api/cart/items/:id', async ({ request, params }) => {
    const body = await readBody(request);
    await delay(chaos.cartLatencyMs());
    const result = updateState((state) => {
      releaseExpired(state, serverNow());
      const outcome = editItem(state, String(params.id), body);
      return { outcome, snapshot: cartSnapshot(state) };
    });
    if (!result.outcome.ok) {
      return HttpResponse.json(withServerTime({ error: result.outcome.error, ...result.snapshot }), {
        status: result.outcome.error.status,
      });
    }
    return HttpResponse.json(withServerTime({ item: result.outcome.value.item, ...result.snapshot }));
  }),

  http.delete('/api/cart/items/:id', async ({ params }) => {
    await delay(chaos.cartLatencyMs());
    const result = updateState((state) => {
      releaseExpired(state, serverNow());
      const outcome = removeItem(state, String(params.id));
      return { outcome, snapshot: cartSnapshot(state) };
    });
    if (!result.outcome.ok) return errorResponse(result.outcome.error.status, result.outcome.error.message, result.outcome.error);
    return HttpResponse.json(withServerTime(result.snapshot));
  }),
];
