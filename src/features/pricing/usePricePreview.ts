import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { CartInput, CartPrice } from '../../domain/pricing';

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; price: CartPrice }
  | { status: 'error'; message: string };

export const PRICE_DEBOUNCE_MS = 300;

/**
 * Live price from the mock /price endpoint.
 *
 * - Debounced: waits until the configuration has been still for 300 ms.
 * - Never shows a stale price: a newer configuration aborts the older request,
 *   and every response is also checked against the latest request id, in case
 *   an old response still arrives.
 * - On failure the caller keeps its configuration; `retry()` asks again.
 */
export function usePricePreview(cart: CartInput | null, debounceMs = PRICE_DEBOUNCE_MS) {
  const key = cart ? JSON.stringify(cart) : null;
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const latestRequest = useRef(0);

  useEffect(() => {
    if (key === null) {
      latestRequest.current++;
      setState({ status: 'idle' });
      return;
    }

    const requestId = ++latestRequest.current;
    const controller = new AbortController();
    setState({ status: 'loading' });

    const timer = setTimeout(() => {
      api
        .price(JSON.parse(key) as CartInput, controller.signal)
        .then(({ price }) => {
          if (requestId === latestRequest.current) setState({ status: 'ready', price });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestId !== latestRequest.current) return;
          setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Could not get the price' });
        });
    }, debounceMs);

    // A newer configuration (or unmount) cancels both the timer and the request in flight.
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt, debounceMs]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
