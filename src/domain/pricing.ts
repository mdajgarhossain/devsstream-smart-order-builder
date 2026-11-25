import { groupUnits, indexOptions } from './menu';
import { percentOf, roundToWholeBdt } from './money';
import { parseClock, secondsOfDay } from './time';
import type { Config, CouponPromo, Menu, Poisha, Promotion } from './types';

export interface CartLineInput {
  config: Config;
  qty: number;
}

export interface CartInput {
  lines: CartLineInput[];
  /** What the customer typed, if anything. It may or may not end up applied. */
  couponCode?: string | null;
}

export interface Adjustment {
  id: string;
  name: string;
  amount: Poisha;
}

export interface PricedLine {
  qty: number;
  /** Step 1: base + options, for one unit. */
  unitSubtotal: Poisha;
  /** Steps 2-3: per-unit promotions, in the order they were applied. */
  unitDiscounts: Adjustment[];
  unitPrice: Poisha;
  /** Step 4: unit price x quantity. */
  lineTotal: Poisha;
}

export type CouponStatus =
  | { code: string; applied: true }
  | { code: string; applied: false; reason: 'unknown' | 'expired' | 'notBest' };

export interface CartPrice {
  lines: PricedLine[];
  subtotal: Poisha;
  /** Every cart discount the cart qualified for (step 5 picks one of these). */
  eligibleDiscounts: Adjustment[];
  cartDiscount: Adjustment | null;
  coupon: CouponStatus | null;
  discountedSubtotal: Poisha;
  vat: Poisha;
  /** discounted subtotal + VAT, before rounding to whole BDT. */
  total: Poisha;
  /** Step 6: rounded half-up to whole BDT (still in poisha, always a multiple of 100). */
  payable: Poisha;
}

export type PricingMenu = Pick<Menu, 'product' | 'groups' | 'vatPercent' | 'cartDiscountTieBreak'>;

/**
 * Prices a cart. Pure: same input, same output; time comes in as `serverTime` (ms).
 * Shared by the mock server (/price, checkout) and the tests.
 *
 * Order (from the brief):
 *  1. unit subtotal = base + sum(option price x qty)
 *  2. extras deal: per unit, floor(units / N) cheapest units free
 *  3. combo: per unit, percent off the step-2 amount
 *  4. line total = unit price x qty; subtotal = sum of lines
 *  5. one cart discount: the larger one; ties go to the tie-break order
 *  6. VAT on the discounted subtotal; payable rounded to whole BDT
 * Percentages round half-up to the nearest poisha; only the payable rounds to whole BDT.
 */
export function priceCart(
  cart: CartInput,
  menu: PricingMenu,
  promos: readonly Promotion[],
  serverTime: number,
): CartPrice {
  const lines = cart.lines.map((line) => priceLine(line, menu, promos));
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  const { eligible, coupon } = cartDiscounts(subtotal, cart.couponCode, promos, serverTime);
  const cartDiscount = pickBest(eligible, menu.cartDiscountTieBreak);
  const couponStatus = finalCouponStatus(coupon, cartDiscount);

  const discountedSubtotal = subtotal - (cartDiscount?.amount ?? 0);
  const vat = percentOf(discountedSubtotal, menu.vatPercent);
  const total = discountedSubtotal + vat;

  return {
    lines,
    subtotal,
    eligibleDiscounts: eligible,
    cartDiscount,
    coupon: couponStatus,
    discountedSubtotal,
    vat,
    total,
    payable: roundToWholeBdt(total),
  };
}

function priceLine(line: CartLineInput, menu: PricingMenu, promos: readonly Promotion[]): PricedLine {
  const index = indexOptions(menu.groups);

  // Step 1
  let amount = menu.product.basePrice;
  for (const [optionId, units] of Object.entries(line.config)) {
    amount += (index.get(optionId)?.option.price ?? 0) * units;
  }
  const unitSubtotal = amount;
  const unitDiscounts: Adjustment[] = [];

  // Step 2
  for (const promo of promos) {
    if (promo.type !== 'freeCheapestPerN') continue;
    const group = menu.groups.find((g) => g.id === promo.group);
    if (!group || promo.every <= 0) continue;
    const unitPrices = group.options
      .flatMap((option) => Array<number>(Math.max(0, line.config[option.id] ?? 0)).fill(option.price))
      .sort((a, b) => a - b);
    const freeUnits = Math.floor(unitPrices.length / promo.every);
    const off = unitPrices.slice(0, freeUnits).reduce((sum, price) => sum + price, 0);
    if (off > 0) {
      unitDiscounts.push({ id: promo.id, name: promo.name, amount: off });
      amount -= off;
    }
  }

  // Step 3
  for (const promo of promos) {
    if (promo.type !== 'comboPercent') continue;
    const met = promo.conditions.every((condition) => {
      const group = menu.groups.find((g) => g.id === condition.group);
      return group !== undefined && groupUnits(line.config, group) >= condition.minUnits;
    });
    if (!met) continue;
    const off = percentOf(amount, promo.percent);
    if (off > 0) {
      unitDiscounts.push({ id: promo.id, name: promo.name, amount: off });
      amount -= off;
    }
  }

  // Step 4 (line part)
  return { qty: line.qty, unitSubtotal, unitDiscounts, unitPrice: amount, lineTotal: amount * line.qty };
}

interface CouponCheck {
  code: string;
  promo?: CouponPromo;
  expired?: boolean;
}

function cartDiscounts(
  subtotal: Poisha,
  couponCode: string | null | undefined,
  promos: readonly Promotion[],
  serverTime: number,
): { eligible: Adjustment[]; coupon: CouponCheck | null } {
  const eligible: Adjustment[] = [];

  for (const promo of promos) {
    if (promo.type === 'cartThreshold' && subtotal >= promo.minSubtotal) {
      eligible.push({ id: promo.id, name: promo.name, amount: Math.min(promo.amountOff, subtotal) });
    }
  }

  const code = couponCode?.trim();
  if (!code) return { eligible, coupon: null };

  const promo = promos.find(
    (p): p is CouponPromo => p.type === 'coupon' && p.code.toUpperCase() === code.toUpperCase(),
  );
  if (!promo) return { eligible, coupon: { code } };

  // Valid strictly before the cut-off, in the promo's own time zone.
  const expired = secondsOfDay(serverTime, promo.timeZone) >= parseClock(promo.validBefore);
  if (!expired) {
    eligible.push({ id: promo.id, name: promo.name, amount: Math.min(percentOf(subtotal, promo.percent), promo.cap) });
  }
  return { eligible, coupon: { code, promo, expired } };
}

function pickBest(eligible: Adjustment[], tieBreak: readonly string[]): Adjustment | null {
  const rank = (id: string) => {
    const i = tieBreak.indexOf(id);
    return i === -1 ? Infinity : i;
  };
  let best: Adjustment | null = null;
  for (const candidate of eligible) {
    if (
      !best ||
      candidate.amount > best.amount ||
      (candidate.amount === best.amount && rank(candidate.id) < rank(best.id))
    ) {
      best = candidate;
    }
  }
  return best;
}

function finalCouponStatus(coupon: CouponCheck | null, chosen: Adjustment | null): CouponStatus | null {
  if (!coupon) return null;
  if (!coupon.promo) return { code: coupon.code, applied: false, reason: 'unknown' };
  if (coupon.expired) return { code: coupon.code, applied: false, reason: 'expired' };
  if (chosen?.id === coupon.promo.id) return { code: coupon.code, applied: true };
  return { code: coupon.code, applied: false, reason: 'notBest' };
}
