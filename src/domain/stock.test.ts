import { describe, expect, it } from 'vitest';
import {
  addUsage,
  checkStock,
  formatShortages,
  ingredientUsage,
  maxQuantity,
  remainingStock,
  stockHeadroom,
} from './stock';
import { ITEM_B, ITEM_C, menu } from '../test/fixtures';
import type { MenuOption } from './types';

const { groups, ingredients } = menu;
const fullStock = remainingStock(ingredients, []);
const option = (id: string) => groups.flatMap((g) => g.options).find((o) => o.id === id) as MenuOption;

describe('ingredientUsage', () => {
  it('adds up ingredients per option unit (Omelette uses 2 eggs)', () => {
    expect(ingredientUsage(ITEM_B, groups)).toEqual({
      croissant: 1,
      egg: 6,
      sausage: 1,
      bacon: 1,
      hashbrown: 1,
      mushroom: 1,
      hollandaise: 1,
    });
  });

  it('multiplies by cart quantity', () => {
    expect(ingredientUsage(ITEM_C, groups, 2)).toMatchObject({ egg: 4, cheese: 4, tofu: 2, paratha: 2 });
  });

  it('ignores options without stock (Ketchup, Chili) and zero quantities', () => {
    expect(ingredientUsage({ ketchup: 1, chili: 1, fried: 0 }, groups)).toEqual({});
  });
});

describe('remainingStock and checkStock', () => {
  it('starts from the fixture stock', () => {
    expect(fullStock).toMatchObject({ egg: 10, cheese: 4, croissant: 2, toast: 20 });
  });

  it('never double-counts: re-saving an item unchanged always fits', () => {
    const heldB = ingredientUsage(ITEM_B, groups);
    const heldC = ingredientUsage(ITEM_C, groups, 2);
    const availableToB = remainingStock(ingredients, [heldC]);

    const result = checkStock(ingredients, availableToB, heldB);

    expect(result.ok).toBe(true);
    expect(result.remainingAfter).toEqual(remainingStock(ingredients, [heldB, heldC]));
  });

  it('a smaller edit releases only the difference', () => {
    const heldC = ingredientUsage(ITEM_C, groups, 2);
    const smallerB = ingredientUsage({ ...ITEM_B, omelette: 1, fried: 1 }, groups); // 3 eggs instead of 6

    const result = checkStock(ingredients, remainingStock(ingredients, [heldC]), smallerB);

    expect(result.remainingAfter.egg).toBe(3);
  });

  it('lists every shortage in menu order with the exact amount', () => {
    const result = checkStock(ingredients, { ...fullStock, egg: 1, cheese: 0 }, { cheese: 3, egg: 4 });
    expect(result.shortages).toEqual([
      { ingredientId: 'egg', name: 'egg', missing: 3 },
      { ingredientId: 'cheese', name: 'cheese', missing: 3 },
    ]);
    expect(formatShortages(result.shortages)).toBe('Short: 3 egg, 3 cheese');
  });

  it('treats an ingredient missing from the menu as out of stock', () => {
    expect(checkStock(ingredients, fullStock, { truffle: 1 }).shortages).toEqual([
      { ingredientId: 'truffle', name: 'truffle', missing: 1 },
    ]);
  });

  it('addUsage sums allocations', () => {
    expect(addUsage({ egg: 2 }, { egg: 3, cheese: 1 })).toEqual({ egg: 5, cheese: 1 });
  });
});

describe('stockHeadroom', () => {
  it('accounts for what the configuration being built already uses', () => {
    // 10 eggs, Omelette x1 already uses 2 -> 8 left -> 4 more omelettes
    expect(stockHeadroom(option('omelette'), { omelette: 1 }, groups, fullStock)).toBe(4);
  });

  it('scales with the cart quantity', () => {
    // qty 2: Omelette x1 uses 4 eggs -> 6 left -> each extra omelette needs 4 -> 1 more
    expect(stockHeadroom(option('omelette'), { omelette: 1 }, groups, fullStock, 2)).toBe(1);
  });

  it('is unlimited for options without stock', () => {
    expect(stockHeadroom(option('ketchup'), {}, groups, fullStock)).toBe(Infinity);
  });
});

describe('maxQuantity', () => {
  it('item C fits twice from full stock, capped by cheese', () => {
    expect(maxQuantity(ingredientUsage(ITEM_C, groups), fullStock)).toEqual({ max: 2, limitedBy: ['cheese'] });
  });
});
