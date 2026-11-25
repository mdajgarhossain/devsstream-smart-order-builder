import { indexOptions } from './menu';
import type { Config, Group, Ingredient, IngredientId, MenuOption } from './types';

/** Ingredient id -> units. Missing ingredient = 0. */
export type Usage = Record<IngredientId, number>;

export interface Shortage {
  ingredientId: IngredientId;
  name: string;
  missing: number;
}

export interface StockCheck {
  ok: boolean;
  /** Every short ingredient, in menu order. */
  shortages: Shortage[];
  /** Stock left after taking `need` (only meaningful when ok). */
  remainingAfter: Usage;
}

/**
 * Ingredients used by a configuration, multiplied by the cart quantity.
 * Options with no ingredients (e.g. unlimited sauces) use nothing.
 */
export function ingredientUsage(config: Readonly<Config>, groups: readonly Group[], qty = 1): Usage {
  const index = indexOptions(groups);
  const usage: Usage = {};
  for (const [optionId, units] of Object.entries(config)) {
    const option = index.get(optionId)?.option;
    if (!option || units <= 0) continue;
    for (const [ingredientId, perUnit] of Object.entries(option.ingredients)) {
      usage[ingredientId] = (usage[ingredientId] ?? 0) + perUnit * units * qty;
    }
  }
  return usage;
}

export function addUsage(...usages: Usage[]): Usage {
  const total: Usage = {};
  for (const usage of usages) {
    for (const [id, units] of Object.entries(usage)) {
      total[id] = (total[id] ?? 0) + units;
    }
  }
  return total;
}

/**
 * Stock still free once every allocation is taken out.
 * To edit an item, leave that item's own allocation out of `allocations`:
 * what it already holds then counts as available to itself.
 */
export function remainingStock(ingredients: readonly Ingredient[], allocations: readonly Usage[]): Usage {
  const held = addUsage(...allocations);
  const remaining: Usage = {};
  for (const ingredient of ingredients) {
    remaining[ingredient.id] = ingredient.stock - (held[ingredient.id] ?? 0);
  }
  return remaining;
}

/** Can `need` be taken from `available`? Lists every shortage with the exact missing amount. */
export function checkStock(ingredients: readonly Ingredient[], available: Usage, need: Usage): StockCheck {
  const shortages: Shortage[] = [];
  const remainingAfter: Usage = { ...available };

  for (const ingredient of ingredients) {
    const wanted = need[ingredient.id] ?? 0;
    if (wanted === 0) continue;
    const free = available[ingredient.id] ?? 0;
    if (wanted > free) {
      shortages.push({ ingredientId: ingredient.id, name: ingredient.name, missing: wanted - free });
    }
    remainingAfter[ingredient.id] = free - wanted;
  }

  // An ingredient the menu never lists has no stock at all.
  for (const [id, wanted] of Object.entries(need)) {
    if (wanted > 0 && !ingredients.some((i) => i.id === id)) {
      shortages.push({ ingredientId: id, name: id, missing: wanted });
    }
  }

  return { ok: shortages.length === 0, shortages, remainingAfter };
}

/** "Short: 2 egg, 2 cheese" */
export function formatShortages(shortages: readonly Shortage[]): string {
  return `Short: ${shortages.map((s) => `${s.missing} ${s.name}`).join(', ')}`;
}

/**
 * How many more units of `option` fit in stock right now, given the
 * configuration being built (at cart quantity `qty`) already uses its share.
 * Infinity when the option uses no stocked ingredient.
 */
export function stockHeadroom(
  option: MenuOption,
  config: Readonly<Config>,
  groups: readonly Group[],
  available: Usage,
  qty = 1,
): number {
  const inUse = ingredientUsage(config, groups, qty);
  let headroom = Infinity;
  for (const [ingredientId, perUnit] of Object.entries(option.ingredients)) {
    if (perUnit <= 0) continue;
    const left = (available[ingredientId] ?? 0) - (inUse[ingredientId] ?? 0);
    headroom = Math.min(headroom, Math.max(0, Math.floor(left / (perUnit * qty))));
  }
  return headroom;
}

/** Largest cart quantity of one configuration that fits, and which ingredients cap it. */
export function maxQuantity(perItem: Usage, available: Usage): { max: number; limitedBy: IngredientId[] } {
  let max = Infinity;
  let limitedBy: IngredientId[] = [];
  for (const [id, units] of Object.entries(perItem)) {
    if (units <= 0) continue;
    const fits = Math.max(0, Math.floor((available[id] ?? 0) / units));
    if (fits < max) {
      max = fits;
      limitedBy = [id];
    } else if (fits === max) {
      limitedBy.push(id);
    }
  }
  return { max, limitedBy };
}
