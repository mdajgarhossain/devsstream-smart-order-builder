# Decisions

Answers to the checkpoints (C1-C2) and decision points (D1-D6) in the brief. Each one is written before or alongside the code it describes.

## C1. Why 679.50 as a float is risky, and how TC-06's VAT rounds

679.50 itself is exact in binary (it's 679 + 1/2), but most of the amounts we derive from it are not. TC-06 lands exactly on a rounding boundary, which is where float error does the most damage. VAT is 5% of 1,509.50, which is exactly 75.475. In JavaScript, `1509.5 * 0.05` gives `75.47500000000001`, and `75.475 * 100` gives `7547.499999999999`. So `Math.round(vat * 100) / 100` and `toFixed(2)` both return 75.47 instead of 75.48. Whether a boundary case rounds up then depends on the order of operations, not on the rule. That's why all money here is an integer number of poisha, and every percentage is computed with integer maths and rounded half-up exactly once.

TC-06 by hand, in poisha:

| Step | Working | Result |
|---|---|---|
| Subtotal | B 67,950 + C 49,000 x 2 | 165,950 (1,659.50) |
| C1 | subtotal >= 120,000, so 10,000 off | 10,000 |
| C2 | 15% of 165,950 = 24,892.5, rounds to 24,893, capped at 15,000 | 15,000 |
| Discount | C2 is larger | 15,000 |
| Discounted subtotal | 165,950 - 15,000 | 150,950 |
| VAT | 150,950 x 5 / 100 = 7,547.5, half-up to the nearest poisha | **7,548 (75.48)** |
| Payable | 150,950 + 7,548 = 158,498 (1,584.98), half-up to whole BDT | **1,585** |

## D2. When is a price locked?

At checkout. Until Pay, the cart is always priced again by the server, using the server clock at that moment, so it reflects the promotions that apply right now. That is what TC-06 and TC-07 describe: the same cart gets C2 at 10:59:59 and falls back to C1 at 11:00:00, so locking at Add to cart would contradict TC-07. When an entered coupon stops applying, the breakdown keeps the code and says why ("not valid at this time") instead of silently dropping it. The order stores the totals computed at the moment of Pay, and those never change afterwards.

## D1. Two tabs, tab B takes the last eggs while tab A is editing

Saving an edit is one PUT, and the server re-checks stock at that moment, with the item's own allocation counted as available to itself. If the new configuration no longer fits, the server answers 409 with every shortage ("Short: 2 egg") and changes nothing, so tab A's original reservation is still intact. Tab A stays in the edit form with every choice kept, shows the shortage with a note that stock changed (maybe in another tab), and takes the fresh free-stock numbers from the response. The user loses nothing. They can lower the eggs and save again, or cancel and keep the old item. The client's own stock numbers are only a hint; the server's check is the one that counts.

## D3. The reservation expires in the middle of an edit

The unsaved changes stay in the form. The countdown runs on server time, so when it reaches zero the screen says the reservation expired and its stock was released, and the Save button becomes "Add as new item". That button tries a fresh reservation with the same choices against the current stock (and shows a shortage if it no longer fits). If Save was pressed right at the boundary, the server answers 410 and the same message appears. The old item stays in the cart as read-only, with Remove only. Editing does not extend a reservation; otherwise a user could hold stock forever by saving every few minutes.

## D4. Who creates the order id and timestamp, and how a double-click on Pay makes one order

The server creates both. The id is the next number after the highest one in the store (ORD-1007 after the seed's ORD-1006), and `createdAt` is the server clock at the moment of Pay. That is the same clock that decided which promotions applied, so the timestamp and the stored price can never disagree, and a wrong browser clock cannot backdate an order into the coupon window. A double-click is stopped at three levels. The Pay button is disabled while the request is in flight. The cart hook hands a second click the same in-flight request. And each Pay attempt carries an idempotency key that the server maps to the order it created, so a repeated request gets the existing order back instead of a new one. Once an order is placed the cart is empty, so even a fresh Pay is refused and the sold stock is never touched again.

## D6. Shape of a stored order

TC-07's cart (B x1 + C x2, coupon typed at 11:00 Dhaka time), with the C line left out for brevity:

```json
{
  "id": "ORD-1007",
  "createdAt": "2026-11-25T05:00:00.000Z",
  "source": "checkout",
  "paymentMethod": "card",
  "currency": "BDT",
  "moneyUnit": "poisha",
  "coupon": { "code": "MORNING15", "applied": false, "reason": "expired" },
  "lines": [
    {
      "qty": 1,
      "options": { "croissant": 1, "omelette": 2, "fried": 2, "sausage": 1, "bacon": 1, "hashbrown": 1, "mushroom": 1, "hollandaise": 1 },
      "unitSubtotal": 75500,
      "unitDiscounts": [{ "id": "P1", "name": "Combo", "amount": 7550 }],
      "unitPrice": 67950,
      "lineTotal": 67950
    }
  ],
  "totals": {
    "subtotal": 165950,
    "discount": { "id": "C1", "name": "Big order", "amount": 10000 },
    "discountedSubtotal": 155950,
    "vat": 7798,
    "total": 163748,
    "payable": 163700
  }
}
```

- Money is integer poisha everywhere, the same unit the engine uses, so nothing is converted or re-rounded on the way in or out. `payable` is always a multiple of 100 (whole BDT).
- Lines keep the seed file's `options` map, plus the per-unit breakdown, so any order can be explained without re-pricing it.
- `coupon` is `null` when nothing was typed. Otherwise it keeps exactly what was typed and whether it was applied. If it was not applied, `reason` says why: `unknown` (not a valid code), `expired` (at or after the cut-off) or `notBest` (the other discount was larger). That's how "entered but not applied" is recorded, and it is what answers "how many orders actually got the coupon".
- `totals.discount` is the one cart discount that won. Totals are written once at Pay and never recomputed (D2).
- Seed orders keep their original `+06:00` timestamps and get `"source": "seed"`. New orders use UTC ISO time from the server clock. Both parse to the same instant, and day grouping always happens in the shop's time zone (Asia/Dhaka, from the menu data).
- The download wraps the list as `{ "schemaVersion": 1, "currency": "BDT", "moneyUnit": "poisha", "exportedAt": "...", "orders": [...] }`.

## C2. Questions the sales assistant supports, and the function behind each

Gemini only picks a function and phrases its result. Every number comes from these pure functions over the stored orders. Each call reads the orders fresh from `GET /api/orders`, so a checkout shows up in the next answer without a reload. The raw orders are never sent to the model.

| Question | Function | Input | Output |
|---|---|---|---|
| How many orders? | `countOrders` | `{ date?: "YYYY-MM-DD" }` | `{ count }` |
| What is the total revenue? | `totalRevenue` | `{ date? }` | `{ orders, revenue: "BDT 4,995.00", revenuePoisha }` |
| What is the best-selling option? | `bestSellingOptions` | `{ limit?: number }` (default 3) | `{ top: [names tied for first], ranking: [{ option, units }] }` |
| Revenue by payment method? | `revenueByPaymentMethod` | `{ date? }` | `{ methods: [{ method, orders, revenue, revenuePoisha }] }`, highest first |
| What is the average order value? | `averageOrderValue` | `{ date? }` | `{ orders, average, averagePoisha }` |
| How many orders actually got the coupon? | `couponUsage` | `{ code?: string }` | `{ entered, applied, appliedOrderIds, notApplied: [{ orderId, reason }] }` |
| Which orders were placed on a given date? | `ordersOnDate` | `{ date: "YYYY-MM-DD" }` | `{ date, count, revenue, orders: [{ id, time, paymentMethod, payable }] }` |

Definitions the functions use:
- Revenue is the sum of `payable` (what customers paid, VAT included).
- Units sold for an option = line quantity x option quantity, summed over all orders. Ties for first place are all returned.
- The average is revenue / orders, rounded half-up to the poisha.
- An order "got the coupon" only when its stored `coupon.applied` is true. Orders that typed a code but did not get it are listed with the reason.
- Dates are calendar days in the shop's time zone (Asia/Dhaka, from the menu data).
- Money is returned both as integer poisha and as a formatted "BDT x,xxx.xx" string, so the model copies text instead of doing arithmetic.

Questions outside this list (customers, profit, staff, anything the orders don't record) have no function. The bot says it can't tell from the order data (see D5).

## D5. "Who is our best customer?" when orders store no customer

The bot says it can't know. Orders hold no customer name, phone or id, so the honest answer is that the order data can't tell who the best customer is, followed by what it can answer instead (revenue, best-selling option, orders on a date, and so on). There are three layers that stop it from inventing a name. First, there is no tool that returns people, and the data has none to return. Second, the system instruction says orders contain no customer information and tells the model never to name or describe a customer. Third, a check in code compares every number in the reply with the numbers the tools actually returned, and replaces any reply with an unsourced figure with a safe "can't answer from the order data" message. A model could in theory still make up a bare name with no number, so that case rests on the instruction and temperature 0. In my live test with Gemini it declined with no tool call. The UI also shows which function each answer came from, so an answer with no source is visible.
