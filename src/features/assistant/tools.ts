import {
  averageOrderValue,
  bestSellingOptions,
  countOrders,
  couponUsage,
  ordersOnDate,
  revenueByPaymentMethod,
  totalRevenue,
  type StatsContext,
} from '../../domain/stats';

/** What the model is told about each tool (Gemini function declarations, JSON Schema parameters). */
export interface ToolDeclaration {
  name: string;
  description: string;
  parametersJsonSchema: object;
}

const dateParam = {
  type: 'string',
  description: "Calendar date in the shop's time zone, format YYYY-MM-DD. Leave out to use all orders.",
};

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'countOrders',
    description: 'Number of orders placed, overall or on one date.',
    parametersJsonSchema: { type: 'object', properties: { date: dateParam } },
  },
  {
    name: 'totalRevenue',
    description: 'Total revenue (sum of what customers paid, VAT included), overall or on one date.',
    parametersJsonSchema: { type: 'object', properties: { date: dateParam } },
  },
  {
    name: 'bestSellingOptions',
    description:
      'Menu options ranked by units sold (line quantity x option quantity). "top" lists everything tied for first place.',
    parametersJsonSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 20, description: 'How many to rank (default 3).' } },
    },
  },
  {
    name: 'revenueByPaymentMethod',
    description: 'Revenue and order count per payment method (card, bkash, cash...), highest revenue first.',
    parametersJsonSchema: { type: 'object', properties: { date: dateParam } },
  },
  {
    name: 'averageOrderValue',
    description: 'Average order value: revenue divided by number of orders.',
    parametersJsonSchema: { type: 'object', properties: { date: dateParam } },
  },
  {
    name: 'couponUsage',
    description:
      'How many orders entered a coupon code, how many actually got the discount, and why the others did not.',
    parametersJsonSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'Coupon code, e.g. MORNING15. Leave out for any code.' } },
    },
  },
  {
    name: 'ordersOnDate',
    description: 'The orders placed on one date, with time, payment method and amount paid.',
    parametersJsonSchema: { type: 'object', properties: { date: dateParam }, required: ['date'] },
  },
];

const str = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);
const int = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined);

/** Run a tool the model asked for. Arguments are checked: the model's input is not trusted either. */
export function runTool(name: string, args: Record<string, unknown>, ctx: StatsContext): object {
  switch (name) {
    case 'countOrders':
      return countOrders(ctx, { date: str(args.date) });
    case 'totalRevenue':
      return totalRevenue(ctx, { date: str(args.date) });
    case 'bestSellingOptions':
      return bestSellingOptions(ctx, { limit: int(args.limit) });
    case 'revenueByPaymentMethod':
      return revenueByPaymentMethod(ctx, { date: str(args.date) });
    case 'averageOrderValue':
      return averageOrderValue(ctx, { date: str(args.date) });
    case 'couponUsage':
      return couponUsage(ctx, { code: str(args.code) });
    case 'ordersOnDate':
      return ordersOnDate(ctx, { date: str(args.date) ?? '' });
    default:
      return { error: `Unknown tool "${name}"` };
  }
}
