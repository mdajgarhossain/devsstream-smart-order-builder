# Answers

Every number here comes from running the app's own code. Nothing was worked out by hand and pasted in.

```bash
npm run answers                      # prints the full report below
npx vitest run src/answers           # the same values as assertions
```

`npm run answers` loads [src/answers/answers.ts](src/answers/answers.ts) through Vite and prints the report. That file only calls the engines the app itself uses: `validate`, `ingredientUsage`, `maxQuantity`, `priceCart`, `priceSeedOrders` and the stats functions. The menu comes from `src/mocks/fixture/menu.json` and the seed orders from `orders.seed.json`. [answers.test.ts](src/answers/answers.test.ts) locks every value, so if an engine changes, the test fails first.

All money is in BDT. Payable is rounded half-up to whole BDT.

## Q1. Maximum number of item C from an empty cart

**2.** **Cheese** is the limit.

| Ingredient | Stock | Per item C | Items that fit |
|---|---|---|---|
| paratha | 10 | 1 | 10 |
| egg | 10 | 2 | 5 |
| tofu | 5 | 1 | 5 |
| **cheese** | **4** | **2** | **2** |
| baked beans | 8 | 1 | 8 |
| mushroom | 6 | 1 | 6 |

Chili uses no stocked ingredient.

## Q2. Cheapest valid configuration

**Toast + Fried x2 + Tofu, at BDT 360.00 per unit.**

- **How it was found:** the code searches every combination the group limits allow (1,368,570 combinations). For each one it runs `validate`, checks it against fresh stock, and prices one unit with `priceCart`.
- **Why the search is fast:** it skips any combination whose best possible price is already higher than the best found so far. That price is worked out as if every promotion gave its biggest discount, so a skipped combination can never be cheaper.
- **A tie:** Ketchup costs 0, so **Toast + Fried x2 + Tofu + Ketchup** also costs 360.00. Both are valid.
- **Working:** base 250 + Toast 0 + Fried 2 × 30 + Tofu 50 = 360. No promotion applies:
  - no extras, so no extras deal;
  - only 2 egg units and 1 protein, so no combo.

## Q3. Cart = A x3 at 10:30 and at 11:30

This assumes the customer typed `MORNING15`. The question asks for the "chosen discount", so a coupon has to be in play.

Item A: base 250 + Toast 0 + Scrambled 2 × 35 + Chicken Sausage 60 + Ketchup 0 = **380.00** per unit. No per-unit promotion applies:
- no extras, so no extras deal;
- only 2 egg units and 1 protein, so no combo.

| Step | 10:30 | 11:30 |
|---|---|---|
| Line: 380.00 × 3 | 1,140.00 | 1,140.00 |
| **Subtotal** | **1,140.00** | **1,140.00** |
| C1 (100 off at ≥ 1,200) | not eligible: 1,140 < 1,200 | not eligible |
| C2 (`MORNING15`, 15% capped at 150, before 11:00) | 15% = 171.00 → capped to 150.00 | expired, because 11:30 is not before 11:00 |
| **Chosen discount** | **C2 −150.00** | **none** |
| Discounted subtotal | 990.00 | 1,140.00 |
| **VAT 5%** | **49.50** | **57.00** |
| Total before rounding | 1,039.50 | 1,197.00 |
| **Payable** | **1,040** (1,039.50 rounds half-up) | **1,197** |

## Q4. Payable at 11:30 after TC-10

**BDT 1,600.**

After TC-10 the cart holds B edited to Omelette x1 + Fried x3 (qty 1), plus C x2 from TC-08.

| Step | Amount |
|---|---|
| B: unit 715.00, combo P1 10% −71.50 | 643.50 × 1 = 643.50 |
| C: unit 515.00, extras deal P2 −25.00 (4 extras, so the cheapest one, Baked Beans, is free) | 490.00 × 2 = 980.00 |
| Subtotal | 1,623.50 |
| Cart discount: C1 −100.00 (subtotal ≥ 1,200; the coupon is not valid after 11:00) | 1,523.50 |
| VAT 5% (76.175, rounded half-up to the poisha) | 76.18 |
| Total before rounding | 1,599.68 |
| **Payable** | **1,600** |

## Q5. Payable of each seed order

Each seed order is priced with our engine at its own `createdAt` time.

| Order | Payable |
|---|---|
| ORD-1001 | 339 |
| ORD-1002 | 713 |
| ORD-1003 | 1,271 |
| ORD-1004 | 578 |
| ORD-1005 | 866 |
| ORD-1006 | 1,228 |
| **Total revenue (6 orders)** | **4,995** |

Revenue here means what customers paid, so it includes VAT.

## Q6. Best-selling option

**Fried, 10 units.** Units are counted as line quantity × option quantity.

| Option | Units |
|---|---|
| **Fried** | **10** |
| Chicken Sausage | 8 |
| Scrambled | 8 |
| Cheese | 6 |
| Omelette | 6 |

## Q7. Payment method with the most revenue

**Card: BDT 2,145** (3 orders). bKash has 1,579 (2 orders) and cash has 1,271 (1 order).

## Q8. Orders that actually got `MORNING15`

**3 of the 4 orders that entered the code got the discount:** ORD-1001, ORD-1003 and ORD-1005.

The coupon gives 15% off, capped at 150. It is valid strictly before 11:00 Dhaka time. Only one cart discount applies, and the larger one wins.

| Order | Time (Dhaka) | Subtotal | C1 (100 off at ≥ 1,200) | C2 (`MORNING15`) | Result |
|---|---|---|---|---|---|
| ORD-1001 | 09:15 | 380.00 | not eligible | 15% = 57.00 | **C2 −57.00** |
| ORD-1003 | 10:05 | 1,360.00 | eligible, 100.00 | 15% = 204.00 → capped to 150.00 | **C2 −150.00** (larger than C1) |
| ORD-1005 | 08:50 | 970.00 | not eligible | 15% = 145.50 | **C2 −145.50** |
| ORD-1006 | 13:10 | 1,169.50 | not eligible | **expired** (13:10 is after 11:00) | **no discount** |

**ORD-1006** is the only order that has the code but did not get the discount:
- it was placed at 13:10, after the coupon's 11:00 cut-off;
- its subtotal of 1,169.50 is below the 1,200 threshold, so C1 does not apply either;
- it paid 1,169.50 + 5% VAT (58.48) = 1,227.98, which rounds to **1,228**.

Each stored order records this outcome directly. Its `coupon` field is `{ "code": "MORNING15", "applied": false, "reason": "expired" }`, which is how the sales assistant answers the same question.
