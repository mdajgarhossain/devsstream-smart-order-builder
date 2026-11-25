import { syncServerTime } from './serverTime';
import type { CartInput, CartPrice } from '../domain/pricing';
import type { Usage } from '../domain/stock';
import type { Menu } from '../domain/types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { message?: string };
}

/** fetch + JSON + error mapping. Also keeps the server clock offset fresh. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, window.location.origin), {
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'Network error: could not reach the server', null);
  }

  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'serverTime' in body && typeof body.serverTime === 'string') {
    syncServerTime(body.serverTime);
  }
  if (!response.ok) {
    const message = (body as ErrorBody | null)?.error?.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

export interface MenuResponse {
  menu: Menu;
  /** Ingredient units free right now (not reserved or sold). */
  stock: Usage;
  serverTime: string;
}

export interface PriceResponse {
  price: CartPrice;
  serverTime: string;
}

export const api = {
  getMenu: (signal?: AbortSignal) => request<MenuResponse>('/api/menu', { signal }),
  price: (cart: CartInput, signal?: AbortSignal) =>
    request<PriceResponse>('/api/price', { method: 'POST', body: JSON.stringify(cart), signal }),
};
