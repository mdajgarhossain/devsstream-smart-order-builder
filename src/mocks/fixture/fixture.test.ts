import { describe, expect, it } from 'vitest';
import menu from './menu.json';
import seed from './orders.seed.json';

// Sanity checks that the fixture matches Appendix A and the seed file is consistent with it.
describe('fixture data', () => {
  const optionIds = new Set(menu.groups.flatMap((g) => g.options.map((o) => o.id)));
  const ingredientIds = new Set(menu.ingredients.map((i) => i.id));

  it('has the five Appendix A groups and 16 options', () => {
    expect(menu.groups.map((g) => g.id)).toEqual(['bread', 'eggs', 'protein', 'extras', 'sauce']);
    expect(optionIds.size).toBe(16);
  });

  it('only uses known ingredients in options', () => {
    for (const group of menu.groups) {
      for (const option of group.options) {
        for (const ingredient of Object.keys(option.ingredients)) {
          expect(ingredientIds.has(ingredient)).toBe(true);
        }
      }
    }
  });

  it('seed orders only reference menu options', () => {
    expect(seed.orders).toHaveLength(6);
    for (const order of seed.orders) {
      for (const line of order.lines) {
        for (const id of Object.keys(line.options)) {
          expect(optionIds.has(id)).toBe(true);
        }
      }
    }
  });
});
