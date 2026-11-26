import { indexOptions } from '../../domain/menu';
import type { Config, Menu } from '../../domain/types';

/**
 * Part G: the configuration being built survives a refresh.
 * Kept in sessionStorage, so each tab has its own draft and closing the tab forgets it.
 */
const KEY = 'sob:draft:v1';

export interface Draft {
  /** null = a new item; otherwise the cart item being edited. */
  itemId: string | null;
  config: Config;
  qty: number;
}

export function saveDraft(draft: Draft): void {
  if (draft.itemId === null && Object.keys(draft.config).length === 0) {
    clearDraft();
    return;
  }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: losing the draft is acceptable, breaking the builder is not.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * The saved draft, cleaned against the current menu: unknown options and bad counts are dropped,
 * and a quantity outside the menu's range falls back to the minimum. Rules are not checked here;
 * the builder shows any problem as usual.
 */
export function loadDraft(menu: Pick<Menu, 'groups' | 'quantity'>): Draft | null {
  let raw: unknown;
  try {
    raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { itemId, config, qty } = raw as Partial<Record<keyof Draft, unknown>>;

  const options = indexOptions(menu.groups);
  const clean: Config = {};
  if (typeof config === 'object' && config !== null) {
    for (const [id, units] of Object.entries(config)) {
      if (options.has(id) && Number.isInteger(units) && (units as number) > 0) clean[id] = units as number;
    }
  }
  const validQty = Number.isInteger(qty) && (qty as number) >= menu.quantity.min && (qty as number) <= menu.quantity.max;

  return {
    itemId: typeof itemId === 'string' ? itemId : null,
    config: clean,
    qty: validQty ? (qty as number) : menu.quantity.min,
  };
}
