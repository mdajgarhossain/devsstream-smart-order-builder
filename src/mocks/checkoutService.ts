import { toStoredOrder, type StoredOrder } from '../domain/orders';
import { priceCart } from '../domain/pricing';
import { CART_CHANGED, versionConflict, type ServiceResult } from './cartService';
import { menu, type ServerState } from './db';

/**
 * Pay: every active cart item becomes ONE order, in one step.
 * - the server creates the order id and timestamp (D4)
 * - the price is computed now, with the server clock, and stored (D2)
 * - reserved stock becomes sold stock (taken off on-hand), the cart empties
 * - the same idempotency key returns the same order, so a double click on Pay makes one order
 */
export function checkout(
  state: ServerState,
  body: { idempotencyKey?: unknown; paymentMethod?: unknown; couponCode?: unknown; baseVersion?: unknown },
  now: number,
): ServiceResult<{ order: StoredOrder; created: boolean }> {
  const key = body.idempotencyKey;
  if (typeof key !== 'string' || key.length === 0) return fail(400, 'idempotencyKey is required');

  // A repeat of a Pay that already went through returns its order, whatever the cart version is now.
  const existingId = state.checkoutKeys[key];
  const existing = existingId ? state.orders.find((o) => o.id === existingId) : undefined;
  if (existing) return { ok: true, value: { order: existing, created: false } };

  // Part G: never charge for a cart this tab has not seen.
  const conflict = versionConflict(body.baseVersion, state.cartVersion, CART_CHANGED);
  if (conflict) return conflict;

  const method = body.paymentMethod;
  if (typeof method !== 'string' || !menu.paymentMethods.includes(method)) {
    return fail(400, `Payment method must be one of: ${menu.paymentMethods.join(', ')}`);
  }
  const coupon = body.couponCode;
  if (coupon !== undefined && coupon !== null && typeof coupon !== 'string') return fail(400, 'couponCode must be a string');

  const active = state.reservations.filter((r) => r.status === 'active');
  if (active.length === 0) {
    return { ok: false, error: { status: 409, code: 'invalid', message: 'Your cart has no active items to pay for' } };
  }

  const lines = active.map((r) => ({ config: r.config, qty: r.qty }));
  const couponCode = typeof coupon === 'string' && coupon.trim() !== '' ? coupon : null;
  const price = priceCart({ lines, couponCode }, menu, menu.promotions, now);
  const order = toStoredOrder(
    { id: nextOrderId(state), createdAt: new Date(now).toISOString(), source: 'checkout', paymentMethod: method },
    lines,
    price,
    menu.currency,
  );

  // Reserved -> sold: take exactly what each reservation held off the shelf.
  for (const reservation of active) {
    for (const [ingredient, units] of Object.entries(reservation.usage)) {
      state.stock[ingredient] = (state.stock[ingredient] ?? 0) - units;
    }
  }
  state.reservations = []; // expired items hold nothing, so they go too: the cart is empty
  state.orders.push(order);
  state.checkoutKeys[key] = order.id;
  state.cartVersion += 1;
  return { ok: true, value: { order, created: true } };
}

/** ORD-1007 after ORD-1006: one more than the highest number in use. */
function nextOrderId(state: ServerState): string {
  const highest = state.orders.reduce((max, o) => Math.max(max, Number(/\d+$/.exec(o.id)?.[0] ?? 0)), 1000);
  return `ORD-${highest + 1}`;
}

function fail(status: number, message: string): ServiceResult<never> {
  return { ok: false, error: { status, code: 'invalid', message } };
}
