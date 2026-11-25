import { indexOptions } from '../domain/menu';
import type { CartInput, CartLineInput } from '../domain/pricing';
import type { Config, Menu } from '../domain/types';

export type ParseResult = { ok: true; cart: CartInput } | { ok: false; message: string };

/** The server never trusts the request body: check shape, option ids and quantities. */
export function parseCartInput(body: unknown, menu: Menu): ParseResult {
  if (!isObject(body) || !Array.isArray(body.lines)) return { ok: false, message: 'Body must have a lines array' };
  const index = indexOptions(menu.groups);
  const lines: CartLineInput[] = [];

  for (const raw of body.lines) {
    if (!isObject(raw) || !isObject(raw.config)) return { ok: false, message: 'Each line needs a config object' };
    const qty = raw.qty;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < menu.quantity.min || qty > menu.quantity.max) {
      return { ok: false, message: `Quantity must be ${menu.quantity.min}-${menu.quantity.max}` };
    }
    const config: Config = {};
    for (const [optionId, units] of Object.entries(raw.config)) {
      if (!index.has(optionId)) return { ok: false, message: `Unknown option "${optionId}"` };
      if (typeof units !== 'number' || !Number.isInteger(units) || units < 0) {
        return { ok: false, message: `Invalid units for "${optionId}"` };
      }
      if (units > 0) config[optionId] = units;
    }
    lines.push({ config, qty });
  }

  const coupon = body.couponCode;
  if (coupon !== undefined && coupon !== null && typeof coupon !== 'string') {
    return { ok: false, message: 'couponCode must be a string' };
  }
  return { ok: true, cart: { lines, couponCode: coupon ?? null } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
