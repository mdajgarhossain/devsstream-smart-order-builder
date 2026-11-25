import menuJson from './fixture/menu.json';
import seedJson from './fixture/orders.seed.json';
import { priceSeedOrders, type SeedOrder, type StoredOrder } from '../domain/orders';
import { addUsage, type Usage } from '../domain/stock';
import type { Config, Menu } from '../domain/types';

/**
 * The mock server's "database".
 *
 * MSW handlers run inside each tab, so in-memory state would give every tab its
 * own server. Keeping state in localStorage (shared by all tabs of the origin)
 * makes them share one server, and it survives a refresh.
 * State is read fresh on every request so a write from another tab is never missed.
 */
const STORAGE_KEY = 'sob:server:v1';

export const menu = menuJson as unknown as Menu;

/** A cart item IS a reservation: it holds `usage` until it expires, is removed or is sold. */
export interface Reservation {
  id: string;
  config: Config;
  qty: number;
  /** Exactly what this item holds. Released as-is, so we never release more than it holds. */
  usage: Usage;
  createdAt: number;
  /** Server time (ms). After this the stock is released and the item is read-only. */
  expiresAt: number;
  status: 'active' | 'expired';
}

export interface ServerState {
  schemaVersion: 1;
  /** Units on hand per ingredient (sold stock is already taken out). */
  stock: Usage;
  reservations: Reservation[];
  /** Add-to-cart idempotency key -> the reservation it created. */
  idempotency: Record<string, string>;
  nextItemNumber: number;
  /** Every order, seed and new, with totals computed when it was placed. */
  orders: StoredOrder[];
  /** Checkout idempotency key -> the order it created. */
  checkoutKeys: Record<string, string>;
}

function initialState(): ServerState {
  return {
    schemaVersion: 1,
    stock: Object.fromEntries(menu.ingredients.map((i) => [i.id, i.stock])),
    reservations: [],
    idempotency: {},
    nextItemNumber: 1,
    // First start: load the seed orders, priced by our engine at each order's createdAt.
    // They are past sales, so they do not take anything from today's stock.
    orders: priceSeedOrders(seedJson.orders as SeedOrder[], menu),
    checkoutKeys: {},
  };
}

export function readState(): ServerState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      // Spread over defaults so state saved by an older build still has every field.
      return { ...initialState(), ...(JSON.parse(raw) as Partial<ServerState>) };
    } catch {
      // Corrupt data: start over rather than crash the server.
    }
  }
  const fresh = initialState();
  writeState(fresh);
  return fresh;
}

export function writeState(state: ServerState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Read, change and save in one synchronous step: no other handler can run in between.
 * If `change` throws, nothing is written, so a failed request leaves no partial change.
 */
export function updateState<T>(change: (state: ServerState) => T): T {
  const state = readState();
  const result = change(state);
  writeState(state);
  return result;
}

/** Mark reservations past their expiry as expired, which releases their stock. */
export function releaseExpired(state: ServerState, now: number): void {
  for (const reservation of state.reservations) {
    if (reservation.status === 'active' && reservation.expiresAt <= now) reservation.status = 'expired';
  }
}

/** Stock free for new reservations: on hand minus what active reservations hold. */
export function freeStock(state: ServerState, exceptId?: string): Usage {
  const held = addUsage(
    ...state.reservations.filter((r) => r.status === 'active' && r.id !== exceptId).map((r) => r.usage),
  );
  const free: Usage = {};
  for (const [id, units] of Object.entries(state.stock)) free[id] = units - (held[id] ?? 0);
  return free;
}
