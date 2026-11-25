import { validate } from '../domain/rules';
import { checkStock, ingredientUsage, type Shortage, type Usage } from '../domain/stock';
import type { Config, Violation } from '../domain/types';
import { chaos } from './chaos';
import { freeStock, menu, type Reservation, type ServerState } from './db';
import { parseCartInput } from './parseCart';

export interface ServiceError {
  status: number;
  code: 'invalid' | 'rules' | 'shortage' | 'not_found' | 'expired';
  message: string;
  shortages?: Shortage[];
  violations?: Violation[];
}

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

export interface CartSnapshot {
  items: Reservation[];
  /** Stock free right now (not held by any active reservation). */
  stock: Usage;
}

export function cartSnapshot(state: ServerState): CartSnapshot {
  return { items: state.reservations, stock: freeStock(state) };
}

interface LineInput {
  config: Config;
  qty: number;
}

/** Shape, option ids, quantity range and the Part A rules. The server never trusts the client. */
function checkLine(body: unknown): ServiceResult<LineInput> {
  const parsed = parseCartInput({ lines: [body] }, menu);
  if (!parsed.ok) return fail(400, 'invalid', parsed.message);
  const line = parsed.cart.lines[0]!;
  const violations = validate(line.config, menu.groups, menu.rules);
  if (violations.length > 0) {
    return { ok: false, error: { status: 422, code: 'rules', message: violations[0]!.message, violations } };
  }
  return { ok: true, value: line };
}

function shortageError(shortages: Shortage[]): ServiceResult<never> {
  return {
    ok: false,
    error: {
      status: 409,
      code: 'shortage',
      message: `Short: ${shortages.map((s) => `${s.missing} ${s.name}`).join(', ')}`,
      shortages,
    },
  };
}

/**
 * Add to cart: reserve every ingredient of the item at once, or nothing.
 * The same idempotency key always returns the same item, so double clicks create one item.
 */
export function reserveItem(
  state: ServerState,
  body: { idempotencyKey?: unknown; config?: unknown; qty?: unknown },
  now: number,
): ServiceResult<{ item: Reservation; created: boolean }> {
  const key = body.idempotencyKey;
  if (typeof key !== 'string' || key.length === 0) return fail(400, 'invalid', 'idempotencyKey is required');

  const existingId = state.idempotency[key];
  const existing = existingId ? state.reservations.find((r) => r.id === existingId) : undefined;
  if (existing) return { ok: true, value: { item: existing, created: false } };

  const line = checkLine({ config: body.config, qty: body.qty });
  if (!line.ok) return line;

  const usage = ingredientUsage(line.value.config, menu.groups, line.value.qty);
  const check = checkStock(menu.ingredients, freeStock(state), usage);
  if (!check.ok) return shortageError(check.shortages);

  const item: Reservation = {
    id: `item-${state.nextItemNumber}`,
    config: line.value.config,
    qty: line.value.qty,
    usage,
    createdAt: now,
    expiresAt: now + menu.reservationSeconds * 1000,
    status: 'active',
  };
  state.nextItemNumber += 1;
  state.reservations.push(item);

  // Simulated crash after the state was partly changed. updateState() does not save
  // when this throws, so the half-done reservation never exists (TC-14).
  if (chaos.reserveCrashes()) throw new Error('Reservation crashed mid-way');

  state.idempotency[key] = item.id;
  return { ok: true, value: { item, created: true } };
}

/**
 * Edit = one call that swaps the old allocation for the new one.
 * The item's own allocation counts as available to itself (net difference).
 * Editing does not extend the reservation: it keeps its original expiry.
 */
export function editItem(
  state: ServerState,
  id: string,
  body: { config?: unknown; qty?: unknown },
): ServiceResult<{ item: Reservation }> {
  const item = state.reservations.find((r) => r.id === id);
  if (!item) return fail(404, 'not_found', 'This item is no longer in the cart');
  if (item.status === 'expired') {
    return fail(410, 'expired', 'This reservation expired and its stock was released');
  }

  const line = checkLine(body);
  if (!line.ok) return line;

  const usage = ingredientUsage(line.value.config, menu.groups, line.value.qty);
  const check = checkStock(menu.ingredients, freeStock(state, item.id), usage);
  if (!check.ok) return shortageError(check.shortages);

  item.config = line.value.config;
  item.qty = line.value.qty;
  item.usage = usage;
  return { ok: true, value: { item } };
}

/** Remove an item (active or expired). Active items give their stock back. */
export function removeItem(state: ServerState, id: string): ServiceResult<null> {
  const index = state.reservations.findIndex((r) => r.id === id);
  if (index === -1) return fail(404, 'not_found', 'This item is no longer in the cart');
  state.reservations.splice(index, 1);
  return { ok: true, value: null };
}

function fail(status: number, code: ServiceError['code'], message: string): { ok: false; error: ServiceError } {
  return { ok: false, error: { status, code, message } };
}
