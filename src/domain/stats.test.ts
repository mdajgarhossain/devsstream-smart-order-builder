import { describe, expect, it } from 'vitest';
import { priceSeedOrders, type SeedOrder } from './orders';
import {
  averageOrderValue,
  bestSellingOptions,
  countOrders,
  couponUsage,
  ordersOnDate,
  revenueByPaymentMethod,
  totalRevenue,
  type StatsContext,
} from './stats';
import seedJson from '../mocks/fixture/orders.seed.json';
import { menu } from '../test/fixtures';

// The brief: unit-test the stats functions against the seed data.
const ctx: StatsContext = { orders: priceSeedOrders(seedJson.orders as SeedOrder[], menu), menu };

describe('stats over the seed orders', () => {
  it('counts orders, overall and per Dhaka date', () => {
    expect(countOrders(ctx)).toEqual({ count: 6 });
    expect(countOrders(ctx, { date: '2026-11-21' })).toEqual({ count: 2, date: '2026-11-21' });
    expect(countOrders(ctx, { date: '21/11/2026' })).toEqual({ error: 'date must be in YYYY-MM-DD format' });
  });

  it('total revenue is the sum of payables: 4,995.00', () => {
    expect(totalRevenue(ctx)).toEqual({ orders: 6, revenue: 'BDT 4,995.00', revenuePoisha: 499500 });
  });

  it('best-selling option by units is Fried (10)', () => {
    const result = bestSellingOptions(ctx, { limit: 3 });
    expect(result.top).toEqual(['Fried']);
    expect(result.ranking).toEqual([
      { option: 'Fried', optionId: 'fried', units: 10 },
      { option: 'Chicken Sausage', optionId: 'sausage', units: 8 },
      { option: 'Scrambled', optionId: 'scrambled', units: 8 },
    ]);
  });

  it('revenue by payment method, highest first: card 2,145 / bkash 1,579 / cash 1,271', () => {
    expect(revenueByPaymentMethod(ctx)).toEqual({
      methods: [
        { method: 'card', orders: 3, revenue: 'BDT 2,145.00', revenuePoisha: 214500 },
        { method: 'bkash', orders: 2, revenue: 'BDT 1,579.00', revenuePoisha: 157900 },
        { method: 'cash', orders: 1, revenue: 'BDT 1,271.00', revenuePoisha: 127100 },
      ],
    });
  });

  it('average order value is 4,995 / 6 = 832.50', () => {
    expect(averageOrderValue(ctx)).toEqual({ orders: 6, average: 'BDT 832.50', averagePoisha: 83250 });
  });

  it('coupon: 4 orders typed MORNING15, 3 got it, ORD-1006 was too late', () => {
    expect(couponUsage(ctx)).toEqual({
      entered: 4,
      applied: 3,
      appliedOrderIds: ['ORD-1001', 'ORD-1003', 'ORD-1005'],
      notApplied: [{ orderId: 'ORD-1006', reason: 'expired' }],
    });
  });

  it('orders on a given date, with Dhaka times', () => {
    expect(ordersOnDate(ctx, { date: '2026-11-21' })).toEqual({
      date: '2026-11-21',
      count: 2,
      revenue: 'BDT 1,849.00',
      orders: [
        { id: 'ORD-1003', time: '10:05', paymentMethod: 'cash', payable: 'BDT 1,271.00' },
        { id: 'ORD-1004', time: '19:30', paymentMethod: 'card', payable: 'BDT 578.00' },
      ],
    });
    expect(ordersOnDate(ctx, { date: '2026-12-01' })).toMatchObject({ count: 0, orders: [] });
  });

  it('follows the data: a new order changes the best seller', () => {
    const extra = { ...ctx.orders[0]!, id: 'ORD-2000', lines: [{ ...ctx.orders[0]!.lines[0]!, qty: 3, options: { scrambled: 2 } }] };
    expect(bestSellingOptions({ ...ctx, orders: [...ctx.orders, extra] }).top).toEqual(['Scrambled']);
  });
});
