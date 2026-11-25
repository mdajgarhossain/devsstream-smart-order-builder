import { describe, expect, it } from 'vitest';
import { optionAvailability } from './availability';
import { remainingStock } from './stock';
import { ITEM_A, menu } from '../test/fixtures';

const { groups, rules, ingredients } = menu;
const fullStock = remainingStock(ingredients, []);

describe('optionAvailability', () => {
  const forA = optionAvailability(ITEM_A, groups, rules, fullStock);

  it('uses group limits: bread is full, ketchup is at maxPerOption', () => {
    expect(forA.get('paratha')).toEqual({ canAdd: 0, limitedBy: 'rule' });
    expect(forA.get('ketchup')).toEqual({ canAdd: 0, limitedBy: 'rule' });
    expect(forA.get('hollandaise')).toEqual({ canAdd: 1, limitedBy: null });
  });

  it('takes the lower of stock and rules', () => {
    // eggs: 2 of max 6 -> rules allow 4; stock: 10 - 2 = 8 -> 4 is the limit
    expect(forA.get('scrambled')?.canAdd).toBe(4);
    // omelette: rules allow 4, stock allows (10 - 2) / 2 = 4
    expect(forA.get('omelette')?.canAdd).toBe(4);
    // croissant stock is 2 but bread max 1 is already used by toast
    expect(forA.get('croissant')?.canAdd).toBe(0);
  });

  it('follows the Croissant override for extras', () => {
    const avail = optionAvailability({ croissant: 1, hashbrown: 1, mushroom: 1 }, groups, rules, fullStock);
    expect(avail.get('cheese')).toEqual({ canAdd: 0, limitedBy: 'rule' });
  });

  it('blocks a third distinct sauce', () => {
    const avail = optionAvailability({ ketchup: 1, hollandaise: 1 }, groups, rules, fullStock);
    expect(avail.get('chili')).toEqual({ canAdd: 0, limitedBy: 'rule' });
  });

  it('reports stock as the reason when stock runs out first', () => {
    const avail = optionAvailability({}, groups, rules, { ...fullStock, bacon: 0 });
    expect(avail.get('bacon')).toEqual({ canAdd: 0, limitedBy: 'stock' });
  });
});
