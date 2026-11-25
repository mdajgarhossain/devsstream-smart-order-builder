import menuJson from './fixture/menu.json';
import type { Usage } from '../domain/stock';
import type { Menu } from '../domain/types';

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

export interface ServerState {
  schemaVersion: 1;
  /** Units on hand per ingredient (sold stock is already taken out). */
  stock: Usage;
}

function initialState(): ServerState {
  return {
    schemaVersion: 1,
    stock: Object.fromEntries(menu.ingredients.map((i) => [i.id, i.stock])),
  };
}

export function readState(): ServerState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as ServerState;
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

/** Read, change and save in one synchronous step (no other handler can run in between). */
export function updateState<T>(change: (state: ServerState) => T): T {
  const state = readState();
  const result = change(state);
  writeState(state);
  return result;
}

/** Stock free for new reservations right now. */
export function freeStock(state: ServerState): Usage {
  return { ...state.stock };
}
