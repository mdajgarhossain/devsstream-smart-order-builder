import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorCode, type CartItem, type CartResponse } from '../../api/client';
import { newIdempotencyKey } from '../../api/ids';
import type { StoredOrder } from '../../domain/orders';
import type { Usage } from '../../domain/stock';
import type { Config } from '../../domain/types';
import { useServerNow } from './useServerNow';

export type Mutation = { ok: true } | { ok: false; status: number; code?: string; message: string };
export type CheckoutResult = { ok: true; order: StoredOrder } | Extract<Mutation, { ok: false }>;

export function isExpired(item: CartItem, now: number): boolean {
  return item.status === 'expired' || item.expiresAt <= now;
}

/**
 * The cart as the server sees it. The server is the source of truth: every
 * response replaces the local items and free stock.
 */
export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [stock, setStock] = useState<Usage | null>(null);
  /** The cart version this tab last saw. Sent with Pay; items carry their own version for Edit/Remove. */
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const now = useServerNow();

  const apply = useCallback((snapshot: Pick<CartResponse, 'items' | 'stock' | 'version'>) => {
    setItems(snapshot.items);
    setStock(snapshot.stock);
    setVersion(snapshot.version);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.getCart());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load the cart');
    }
  }, [apply]);

  // Page load (Part G): the server drops expired items, so a refresh keeps only still-valid reservations.
  useEffect(() => {
    api
      .dropExpired()
      .then((snapshot) => {
        apply(snapshot);
        setLoadError(null);
      })
      .catch((error: unknown) => setLoadError(error instanceof ApiError ? error.message : 'Could not load the cart'))
      .finally(() => setLoaded(true));
  }, [apply]);

  // When a countdown reaches 0 (server time), ask the server so the released stock shows up.
  const refreshedForExpiry = useRef(new Set<string>());
  useEffect(() => {
    const newlyExpired = items.filter(
      (item) => item.status === 'active' && item.expiresAt <= now && !refreshedForExpiry.current.has(item.id),
    );
    if (newlyExpired.length === 0) return;
    newlyExpired.forEach((item) => refreshedForExpiry.current.add(item.id));
    void refresh();
  }, [items, now, refresh]);

  const fail = useCallback(
    (error: unknown): Mutation => {
      // Error responses for cart calls may carry a fresh snapshot (e.g. after a 409); use it.
      if (error instanceof ApiError && error.body && typeof error.body === 'object' && 'items' in error.body) {
        apply(error.body as CartResponse);
      } else {
        void refresh();
      }
      return {
        ok: false,
        status: error instanceof ApiError ? error.status : 0,
        code: errorCode(error),
        message: error instanceof ApiError ? error.message : 'Something went wrong',
      };
    },
    [apply, refresh],
  );

  // One idempotency key per add attempt. Retrying the same configuration reuses it;
  // a click while that add is still in flight gets the same promise back.
  const addAttempt = useRef<{ fingerprint: string; key: string; promise?: Promise<Mutation> } | null>(null);

  const add = useCallback(
    (config: Config, qty: number): Promise<Mutation> => {
      const fingerprint = JSON.stringify({ config, qty });
      if (addAttempt.current?.fingerprint !== fingerprint) {
        addAttempt.current = { fingerprint, key: newIdempotencyKey() };
      }
      const attempt = addAttempt.current;
      if (attempt.promise) return attempt.promise;

      attempt.promise = api
        .addItem({ idempotencyKey: attempt.key, config, qty })
        .then((response): Mutation => {
          apply(response);
          if (addAttempt.current === attempt) addAttempt.current = null; // next add is a new item
          return { ok: true };
        })
        .catch((error: unknown) => {
          attempt.promise = undefined; // allow Retry with the same key
          return fail(error);
        });
      return attempt.promise;
    },
    [apply, fail],
  );

  const itemVersion = useCallback((id: string) => items.find((item) => item.id === id)?.version, [items]);

  const update = useCallback(
    (id: string, config: Config, qty: number): Promise<Mutation> =>
      api
        .updateItem(id, { config, qty, baseVersion: itemVersion(id) })
        .then((response): Mutation => {
          apply(response);
          return { ok: true };
        })
        .catch(fail),
    [apply, fail, itemVersion],
  );

  // Pay: one idempotency key per attempt (same items, method and coupon), reused on Retry.
  const payAttempt = useRef<{ fingerprint: string; key: string; promise?: Promise<CheckoutResult> } | null>(null);

  const checkout = useCallback(
    (paymentMethod: string, couponCode: string): Promise<CheckoutResult> => {
      const activeIds = items.filter((item) => item.status === 'active').map((item) => item.id);
      const fingerprint = JSON.stringify({ activeIds, paymentMethod, couponCode });
      if (payAttempt.current?.fingerprint !== fingerprint) {
        payAttempt.current = { fingerprint, key: newIdempotencyKey() };
      }
      const attempt = payAttempt.current;
      if (attempt.promise) return attempt.promise;

      attempt.promise = api
        .checkout({ idempotencyKey: attempt.key, paymentMethod, couponCode: couponCode.trim() || null, baseVersion: version })
        .then((response): CheckoutResult => {
          apply(response);
          if (payAttempt.current === attempt) payAttempt.current = null;
          return { ok: true, order: response.order };
        })
        .catch((error: unknown) => {
          attempt.promise = undefined;
          return fail(error) as Extract<Mutation, { ok: false }>;
        });
      return attempt.promise;
    },
    [items, version, apply, fail],
  );

  const remove = useCallback(
    (id: string): Promise<Mutation> =>
      api
        .removeItem(id, itemVersion(id))
        .then((response): Mutation => {
          apply(response);
          return { ok: true };
        })
        .catch(fail),
    [apply, fail, itemVersion],
  );

  return { items, stock, loaded, loadError, now, refresh, add, update, remove, checkout };
}
