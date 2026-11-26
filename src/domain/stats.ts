import { divideHalfUp, formatBdt } from './money';
import type { StoredOrder } from './orders';
import { dateIn } from './time';
import type { Menu, Poisha } from './types';

/**
 * Sales statistics over stored orders. Pure functions: the assistant's numbers
 * come from here, never from the model (checkpoint C2).
 */
export interface StatsContext {
  orders: readonly StoredOrder[];
  menu: Pick<Menu, 'groups' | 'timeZone' | 'currency'>;
}

type DateFilter = { date?: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function money(ctx: StatsContext, amount: Poisha): string {
  return `${ctx.menu.currency} ${formatBdt(amount)}`;
}

function onDate(ctx: StatsContext, date?: string): readonly StoredOrder[] {
  if (!date) return ctx.orders;
  return ctx.orders.filter((order) => dateIn(Date.parse(order.createdAt), ctx.menu.timeZone) === date);
}

function badDate(date: string | undefined) {
  return date !== undefined && !DATE_PATTERN.test(date) ? { error: 'date must be in YYYY-MM-DD format' } : null;
}

const sumPayable = (orders: readonly StoredOrder[]) => orders.reduce((sum, o) => sum + o.totals.payable, 0);

export function countOrders(ctx: StatsContext, { date }: DateFilter = {}) {
  return badDate(date) ?? { count: onDate(ctx, date).length, ...(date ? { date } : {}) };
}

/** Revenue = sum of what customers paid (payable, VAT included). */
export function totalRevenue(ctx: StatsContext, { date }: DateFilter = {}) {
  if (badDate(date)) return badDate(date)!;
  const orders = onDate(ctx, date);
  const total = sumPayable(orders);
  return { orders: orders.length, revenue: money(ctx, total), revenuePoisha: total, ...(date ? { date } : {}) };
}

/** Units = line qty x option qty, over every order. Everything tied for first is in `top`. */
export function bestSellingOptions(ctx: StatsContext, { limit = 3 }: { limit?: number } = {}) {
  const units = new Map<string, number>();
  for (const order of ctx.orders) {
    for (const line of order.lines) {
      for (const [optionId, perUnit] of Object.entries(line.options)) {
        units.set(optionId, (units.get(optionId) ?? 0) + line.qty * perUnit);
      }
    }
  }
  const names = new Map(ctx.menu.groups.flatMap((g) => g.options.map((o) => [o.id, o.name] as const)));
  const ranking = [...units.entries()]
    .map(([optionId, count]) => ({ option: names.get(optionId) ?? optionId, optionId, units: count }))
    .sort((a, b) => b.units - a.units || a.option.localeCompare(b.option));
  const best = ranking[0]?.units ?? 0;
  return {
    top: ranking.filter((r) => r.units === best && best > 0).map((r) => r.option),
    ranking: ranking.slice(0, Math.max(1, Math.floor(limit))),
  };
}

export function revenueByPaymentMethod(ctx: StatsContext, { date }: DateFilter = {}) {
  if (badDate(date)) return badDate(date)!;
  const groups = new Map<string, StoredOrder[]>();
  for (const order of onDate(ctx, date)) {
    groups.set(order.paymentMethod, [...(groups.get(order.paymentMethod) ?? []), order]);
  }
  const methods = [...groups.entries()]
    .map(([method, orders]) => {
      const total = sumPayable(orders);
      return { method, orders: orders.length, revenue: money(ctx, total), revenuePoisha: total };
    })
    .sort((a, b) => b.revenuePoisha - a.revenuePoisha);
  return { methods, ...(date ? { date } : {}) };
}

/** Revenue / orders, rounded half-up to the poisha. */
export function averageOrderValue(ctx: StatsContext, { date }: DateFilter = {}) {
  if (badDate(date)) return badDate(date)!;
  const orders = onDate(ctx, date);
  const average = orders.length === 0 ? 0 : divideHalfUp(sumPayable(orders), orders.length);
  return { orders: orders.length, average: money(ctx, average), averagePoisha: average, ...(date ? { date } : {}) };
}

/** Orders where a code was typed, and how many of them actually got the discount. */
export function couponUsage(ctx: StatsContext, { code }: { code?: string } = {}) {
  const wanted = code?.trim().toUpperCase();
  const withCode = ctx.orders.filter((o) => o.coupon && (!wanted || o.coupon.code.trim().toUpperCase() === wanted));
  const applied = withCode.filter((o) => o.coupon?.applied);
  return {
    ...(wanted ? { code: wanted } : {}),
    entered: withCode.length,
    applied: applied.length,
    appliedOrderIds: applied.map((o) => o.id),
    notApplied: withCode
      .filter((o) => o.coupon && !o.coupon.applied)
      .map((o) => ({ orderId: o.id, reason: o.coupon && !o.coupon.applied ? o.coupon.reason : 'unknown' })),
  };
}

export function ordersOnDate(ctx: StatsContext, { date }: { date: string }) {
  if (!date || badDate(date)) return { error: 'date must be in YYYY-MM-DD format' };
  const orders = onDate(ctx, date);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: ctx.menu.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return {
    date,
    count: orders.length,
    revenue: money(ctx, sumPayable(orders)),
    orders: orders.map((o) => ({
      id: o.id,
      time: time.format(new Date(o.createdAt)),
      paymentMethod: o.paymentMethod,
      payable: money(ctx, o.totals.payable),
    })),
  };
}
