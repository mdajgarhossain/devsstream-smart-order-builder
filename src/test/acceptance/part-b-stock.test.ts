import { describe, expect, it } from 'vitest';
import { optionAvailability } from '../../domain/availability';
import { checkStock, formatShortages, ingredientUsage, remainingStock } from '../../domain/stock';
import { ITEM_A, ITEM_B, ITEM_C, menu } from '../fixtures';
import type { Config } from '../../domain/types';

const { groups, rules, ingredients } = menu;
const usage = (config: Config, qty = 1) => ingredientUsage(config, groups, qty);

// The TC-08 cart: B x1 + C x2. Each test below starts from this cart.
const heldB = usage(ITEM_B, 1);
const heldC = usage(ITEM_C, 2);

describe('Section 9 - Part B shared stock', () => {
  it('TC-08: cart B x1 + C x2 leaves egg 0, cheese 0, croissant 1 and blocks new egg items', () => {
    const remaining = remainingStock(ingredients, [heldB, heldC]);

    expect(remaining).toMatchObject({ egg: 0, cheese: 0, croissant: 1 });

    const newItem = checkStock(ingredients, remaining, usage(ITEM_A));
    expect(newItem.ok).toBe(false);
    expect(formatShortages(newItem.shortages)).toBe('Short: 2 egg');

    const fresh = optionAvailability({}, groups, rules, remaining);
    for (const eggOption of ['fried', 'scrambled', 'omelette']) {
      expect(fresh.get(eggOption)).toEqual({ canAdd: 0, limitedBy: 'stock' });
    }
  });

  it("TC-09: editing B to Omelette x3 + Fried x1 is short 1 egg (B's own 6 eggs count as available)", () => {
    const availableToB = remainingStock(ingredients, [heldC]);
    const edited = { ...ITEM_B, omelette: 3, fried: 1 };

    const result = checkStock(ingredients, availableToB, usage(edited));

    expect(result.ok).toBe(false);
    expect(formatShortages(result.shortages)).toBe('Short: 1 egg');
  });

  it('TC-10: editing B to Omelette x1 + Fried x3 is allowed and leaves 1 egg', () => {
    const availableToB = remainingStock(ingredients, [heldC]);
    const edited = { ...ITEM_B, omelette: 1, fried: 3 };

    const result = checkStock(ingredients, availableToB, usage(edited));

    expect(result.ok).toBe(true);
    expect(result.remainingAfter.egg).toBe(1);
    expect(remainingStock(ingredients, [usage(edited), heldC]).egg).toBe(1);
  });

  it('TC-11: changing C quantity 2 -> 3 lists every shortage', () => {
    const availableToC = remainingStock(ingredients, [heldB]);

    const result = checkStock(ingredients, availableToC, usage(ITEM_C, 3));

    expect(result.ok).toBe(false);
    expect(formatShortages(result.shortages)).toBe('Short: 2 egg, 2 cheese');
  });
});
