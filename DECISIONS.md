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
