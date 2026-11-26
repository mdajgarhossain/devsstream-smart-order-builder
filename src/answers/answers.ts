// Computes the answers for ANSWERS.md (Section 10) with the app's own engines.
// Run `npm run answers` to print the report; answers.test.ts locks the values.

import { formatBdt } from '../domain/money';
import { priceCart, type CartInput, type CartPrice } from '../domain/pricing';
import { priceSeedOrders, type SeedOrder, type StoredOrder } from '../domain/orders';
import { validate } from '../domain/rules';
import { bestSellingOptions, couponUsage, revenueByPaymentMethod, totalRevenue, type StatsContext } from '../domain/stats';
import { checkStock, ingredientUsage, maxQuantity, remainingStock } from '../domain/stock';
import type { Config, Group, Menu, Poisha } from '../domain/types';
import menuJson from '../mocks/fixture/menu.json';
import seedJson from '../mocks/fixture/orders.seed.json';

export const menu = menuJson as unknown as Menu;
const seed = seedJson.orders as SeedOrder[];

// The reference items from Section 9.
export const ITEM_A: Config = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 };
export const ITEM_B: Config = { croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1, hashbrown: 1, mushroom: 1, hollandaise: 1 };
export const ITEM_C: Config = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 };

/** A clock time in the shop's zone (Asia/Dhaka is UTC+6 all year), on a fixed day. */
const shopTime = (hhmm: string) => Date.parse(`2026-11-26T${hhmm}:00+06:00`);

const bdt = (amount: Poisha) => `${menu.currency} ${formatBdt(amount)}`;
const fullStock = () => remainingStock(menu.ingredients, []);
const optionNames = new Map(menu.groups.flatMap((g) => g.options.map((o) => [o.id, o.name] as const)));
const ingredientName = (id: string) => menu.ingredients.find((i) => i.id === id)?.name ?? id;

export function describeConfig(config: Config): string {
  return Object.entries(config)
    .filter(([, units]) => units > 0)
    .map(([id, units]) => (units > 1 ? `${optionNames.get(id) ?? id} x${units}` : (optionNames.get(id) ?? id)))
    .join(' + ');
}

// Q1 ------------------------------------------------------------------------

export function q1() {
  const perItem = ingredientUsage(ITEM_C, menu.groups);
  const available = fullStock();
  const { max, limitedBy } = maxQuantity(perItem, available);
  const perIngredient = Object.entries(perItem).map(([id, need]) => ({
    ingredient: ingredientName(id),
    stock: available[id] ?? 0,
    perItem: need,
    fits: Math.floor((available[id] ?? 0) / need),
  }));
  return { max, limitedBy: limitedBy.map(ingredientName), perIngredient };
}

// Q2 ------------------------------------------------------------------------

/** Every way to pick units inside one group that respects its own limits (range, step, per option, distinct). */
function groupChoices(group: Group): Config[] {
  const perOptionCap = group.maxPerOption ?? group.max;
  if (perOptionCap === undefined) throw new Error(`Group ${group.id} has no upper limit; cannot list its choices.`);
  const results: Config[] = [];
  const walk = (index: number, picked: Config, total: number) => {
    if (index === group.options.length) {
      const distinct = Object.keys(picked).length;
      const inRange = total >= (group.min ?? 0) && total <= (group.max ?? Infinity);
      const onStep = group.step === undefined || total % group.step === 0;
      const fewEnough = group.maxDistinct === undefined || distinct <= group.maxDistinct;
      if (inRange && onStep && fewEnough) results.push({ ...picked });
      return;
    }
    const option = group.options[index]!;
    for (let units = 0; units <= perOptionCap && total + units <= (group.max ?? Infinity); units++) {
      walk(index + 1, units > 0 ? { ...picked, [option.id]: units } : picked, total + units);
    }
  };
  walk(0, {}, 0);
  return results;
}

/**
 * Search over the whole menu: every combination of group choices, kept only if
 * `validate` finds no violation and fresh stock covers it, priced with `priceCart`.
 *
 * To stay fast it skips a combination when even the biggest possible per-unit
 * discount could not bring it down to the best price found so far:
 * price >= (subtotal - every unit in a "free cheapest" group) x (100 - all combo %) / 100.
 * The bound never overestimates, so no cheaper configuration can be skipped.
 */
export function q2() {
  const price = new Map(menu.groups.flatMap((g) => g.options.map((o) => [o.id, o.price] as const)));
  const sum = (config: Config) => Object.entries(config).reduce((total, [id, units]) => total + (price.get(id) ?? 0) * units, 0);
  const freeGroups = new Set(menu.promotions.flatMap((p) => (p.type === 'freeCheapestPerN' ? [p.group] : [])));
  const comboPercent = menu.promotions.reduce((total, p) => total + (p.type === 'comboPercent' ? p.percent : 0), 0);

  // Cheapest choices first, so a good best price is found early.
  const perGroup = menu.groups.map((group) =>
    groupChoices(group)
      .map((config) => ({ config, cost: sum(config), freeable: freeGroups.has(group.id) ? sum(config) : 0 }))
      .sort((a, b) => a.cost - b.cost),
  );
  const available = fullStock();
  let checked = 0;
  let skipped = 0;
  let best: { price: Poisha; configs: Config[] } = { price: Infinity, configs: [] };

  const walk = (index: number, config: Config, cost: number, freeable: number) => {
    if (index === perGroup.length) {
      checked++;
      const lowerBound = ((menu.product.basePrice + cost - freeable) * (100 - comboPercent)) / 100;
      if (lowerBound > best.price) {
        skipped++;
        return;
      }
      if (validate(config, menu.groups, menu.rules).length > 0) return;
      if (!checkStock(menu.ingredients, available, ingredientUsage(config, menu.groups)).ok) return;
      const unitPrice = priceCart({ lines: [{ config, qty: 1 }] }, menu, menu.promotions, shopTime('12:00')).lines[0]!.unitPrice;
      if (unitPrice < best.price) best = { price: unitPrice, configs: [config] };
      else if (unitPrice === best.price) best.configs.push(config);
      return;
    }
    for (const choice of perGroup[index]!) {
      walk(index + 1, { ...config, ...choice.config }, cost + choice.cost, freeable + choice.freeable);
    }
  };
  walk(0, {}, 0, 0);

  return { checked, skipped, unitPrice: best.price, configs: best.configs };
}

// Q3 / Q4 -------------------------------------------------------------------

export interface PricedAt {
  time: string;
  cart: CartInput;
  price: CartPrice;
}

const priceAt = (cart: CartInput, time: string): PricedAt => ({
  time,
  cart,
  price: priceCart(cart, menu, menu.promotions, shopTime(time)),
});

/** Q3 assumes the customer typed the coupon code (the question asks for the "chosen" discount). */
export function q3() {
  const couponCode = menu.promotions.find((p) => p.type === 'coupon')?.code ?? null;
  const cart: CartInput = { lines: [{ config: ITEM_A, qty: 3 }], couponCode };
  return [priceAt(cart, '10:30'), priceAt(cart, '11:30')];
}

/** The cart right after TC-10: B edited to Omelette x1 + Fried x3, and C x2 (from TC-08). */
export function q4() {
  const editedB: Config = { ...ITEM_B, omelette: 1, fried: 3 };
  return priceAt({ lines: [{ config: editedB, qty: 1 }, { config: ITEM_C, qty: 2 }], couponCode: null }, '11:30');
}

// Q5 - Q8 -------------------------------------------------------------------

export const seedOrders = (): StoredOrder[] => priceSeedOrders(seed, menu);
const stats = (): StatsContext => ({ orders: seedOrders(), menu });

/** Stats functions return { error } only for a bad date filter; none is passed here. */
function ok<T extends object>(result: T | { error: string }): T {
  if ('error' in result) throw new Error(result.error);
  return result;
}

export function q5() {
  const orders = seedOrders();
  return { orders: orders.map((o) => ({ id: o.id, payable: o.totals.payable })), total: ok(totalRevenue(stats())) };
}

export const q6 = () => bestSellingOptions(stats(), { limit: 5 });

export const q7 = () => ok(revenueByPaymentMethod(stats()));

export function q8() {
  const code = menu.promotions.find((p) => p.type === 'coupon')?.code;
  const usage = couponUsage(stats(), { code });
  const byId = new Map(seedOrders().map((o) => [o.id, o]));
  const withCode = seed.filter((o) => o.couponCode).map((o) => byId.get(o.id)!);
  return { code, usage, withCode };
}

// Report --------------------------------------------------------------------

function cartWorking({ time, price }: PricedAt): string[] {
  const out: string[] = [];
  price.lines.forEach((line, i) => {
    const discounts = line.unitDiscounts.map((d) => ` - ${d.id} ${formatBdt(d.amount)}`).join('');
    out.push(
      `  line ${i + 1}: unit ${formatBdt(line.unitSubtotal)}${discounts} = ${formatBdt(line.unitPrice)} x ${line.qty} = ${formatBdt(line.lineTotal)}`,
    );
  });
  out.push(`  subtotal: ${bdt(price.subtotal)}`);
  out.push(
    `  eligible cart discounts at ${time}: ${price.eligibleDiscounts.map((d) => `${d.id} ${formatBdt(d.amount)}`).join(', ') || 'none'}`,
  );
  out.push(`  chosen discount: ${price.cartDiscount ? `${price.cartDiscount.id} (${price.cartDiscount.name}) -${formatBdt(price.cartDiscount.amount)}` : 'none'}`);
  if (price.coupon) out.push(`  coupon ${price.coupon.code}: ${price.coupon.applied ? 'applied' : `not applied (${price.coupon.reason})`}`);
  out.push(`  discounted subtotal: ${bdt(price.discountedSubtotal)}`);
  out.push(`  VAT ${menu.vatPercent}%: ${bdt(price.vat)}`);
  out.push(`  total before rounding: ${bdt(price.total)}`);
  out.push(`  payable (whole BDT, half-up): ${bdt(price.payable)}`);
  return out;
}

export function report(): string {
  const out: string[] = [];
  const h = (title: string) => out.push('', title, '-'.repeat(title.length));

  const a1 = q1();
  h('Q1. Maximum number of item C from an empty cart');
  for (const row of a1.perIngredient) out.push(`  ${row.ingredient}: stock ${row.stock} / ${row.perItem} per item = ${row.fits}`);
  out.push(`  Answer: ${a1.max}, limited by ${a1.limitedBy.join(', ')}`);

  const a2 = q2();
  h('Q2. Cheapest valid configuration');
  out.push(`  searched ${a2.checked} combinations (${a2.skipped} ruled out by the price bound, the rest validated and priced)`);
  for (const config of a2.configs) out.push(`  ${describeConfig(config)} -> ${bdt(a2.unitPrice)}`);

  h('Q3. Cart = A x3 (coupon code entered)');
  for (const priced of q3()) {
    out.push(` At ${priced.time}:`);
    out.push(...cartWorking(priced));
  }

  h('Q4. After TC-10 (B as Omelette x1 + Fried x3, plus C x2), at 11:30');
  out.push(...cartWorking(q4()));

  const a5 = q5();
  h('Q5. Payable of each seed order');
  for (const order of a5.orders) out.push(`  ${order.id}: ${bdt(order.payable)}`);
  out.push(`  Total revenue (${a5.total.orders} orders): ${a5.total.revenue}`);

  const a6 = q6();
  h('Q6. Best-selling option (units = line qty x option qty)');
  for (const row of a6.ranking) out.push(`  ${row.option}: ${row.units}`);
  out.push(`  Answer: ${a6.top.join(', ')}`);

  h('Q7. Revenue by payment method');
  for (const m of q7().methods) out.push(`  ${m.method}: ${m.revenue} (${m.orders} orders)`);

  const a8 = q8();
  h(`Q8. Orders that actually got ${a8.code}`);
  for (const order of a8.withCode) {
    const local = order.createdAt.slice(11, 16);
    const coupon = order.coupon!;
    const result = coupon.applied
      ? `applied, -${formatBdt(order.totals.discount!.amount)}`
      : `NOT applied (${coupon.reason}); discount used: ${order.totals.discount ? order.totals.discount.id : 'none'}`;
    out.push(`  ${order.id} at ${local}, subtotal ${formatBdt(order.totals.subtotal)}: ${result}`);
  }
  out.push(`  Answer: ${a8.usage.applied} of ${a8.usage.entered} (${a8.usage.appliedOrderIds.join(', ')})`);

  return out.join('\n').trimStart();
}
