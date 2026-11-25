import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Usage } from '../../domain/stock';
import type { Menu } from '../../domain/types';

export type MenuState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; menu: Menu; stock: Usage };

/** Loads the menu and free stock from the mock API. Nothing about the menu is bundled in the UI. */
export function useMenu() {
  const [state, setState] = useState<MenuState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    api
      .getMenu(controller.signal)
      .then(({ menu, stock }) => setState({ status: 'ready', menu, stock }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Could not load the menu' });
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
