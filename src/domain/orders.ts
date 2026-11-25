import { priceCart, type Adjustment, type CartLineInput, type CartPrice, type CouponStatus } from './pricing';
import type { Config, Menu, Poisha } from './types';

/**
 * A stored order (decision D6). All money is integer poisha.
 * Totals are computed once, when the order is placed, and never change afterwards (D2).
 */
export interface StoredOrder {
  id: string;
  /** ISO 8601. Seed orders keep their original +06:00 timestamps; new orders are written in UTC. */
  createdAt: string;
  source: 'seed' | 'checkout';
  paymentMethod: string;
  currency: string;
  moneyUnit: 'poisha';
  /** null = no code entered. Otherwise what was typed and whether it was applied (and if not, why). */
  coupon: CouponStatus | null;
  lines: StoredOrderLine[];
  totals: {
    subtotal: Poisha;
    /** The one cart discount that was applied (C1 or C2), if any. */
    discount: Adjustment | null;
    discountedSubtotal: Poisha;
    vat: Poisha;
    /** discounted subtotal + VAT before rounding. */
    total: Poisha;
    /** What the customer paid: whole BDT, in poisha. */
    payable: Poisha;
  };
}

export interface StoredOrderLine {
  qty: number;
  options: Config;
  unitSubtotal: Poisha;
  unitDiscounts: Adjustment[];
  unitPrice: Poisha;
  lineTotal: Poisha;
}

export interface OrderMeta {
  id: string;
  createdAt: string;
  source: StoredOrder['source'];
  paymentMethod: string;
}

/** Turn a priced cart into the stored order shape. */
export function toStoredOrder(meta: OrderMeta, lines: CartLineInput[], price: CartPrice, currency: string): StoredOrder {
  return {
    ...meta,
    currency,
    moneyUnit: 'poisha',
    coupon: price.coupon,
    lines: lines.map((line, i) => {
      const priced = price.lines[i]!;
      return {
        qty: line.qty,
        options: line.config,
        unitSubtotal: priced.unitSubtotal,
        unitDiscounts: priced.unitDiscounts,
        unitPrice: priced.unitPrice,
        lineTotal: priced.lineTotal,
      };
    }),
    totals: {
      subtotal: price.subtotal,
      discount: price.cartDiscount,
      discountedSubtotal: price.discountedSubtotal,
      vat: price.vat,
      total: price.total,
      payable: price.payable,
    },
  };
}

export interface SeedOrder {
  id: string;
  createdAt: string;
  paymentMethod: string;
  couponCode: string | null;
  lines: { qty: number; options: Config }[];
}

/** Seed orders come without prices: price each one with our own engine at its own createdAt. */
export function priceSeedOrders(seed: readonly SeedOrder[], menu: Menu): StoredOrder[] {
  return seed.map((order) => {
    const lines = order.lines.map((line) => ({ config: line.options, qty: line.qty }));
    const price = priceCart({ lines, couponCode: order.couponCode }, menu, menu.promotions, Date.parse(order.createdAt));
    const meta: OrderMeta = { id: order.id, createdAt: order.createdAt, source: 'seed', paymentMethod: order.paymentMethod };
    return toStoredOrder(meta, lines, price, menu.currency);
  });
}

/** The file behind "Download orders.json". */
export function ordersExport(orders: readonly StoredOrder[], exportedAt: string) {
  return { schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha', exportedAt, orders };
}
