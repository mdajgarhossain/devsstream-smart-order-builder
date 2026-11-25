import { describe, expect, it } from 'vitest';
import { validate } from './rules';
import { ITEM_A, ITEM_B, ITEM_C, menu } from '../test/fixtures';
import type { Config, Group, Rule } from './types';

const check = (config: Config) => validate(config, menu.groups, menu.rules);
const codes = (config: Config) => check(config).map((v) => `${v.code}:${v.groupId ?? v.ruleId}`);

describe('validate', () => {
  it('accepts the reference items A, B and C', () => {
    expect(check(ITEM_A)).toEqual([]);
    expect(check(ITEM_B)).toEqual([]);
    expect(check(ITEM_C)).toEqual([]);
  });

  it('accepts Scrambled x1 + Fried x1 (brief example)', () => {
    expect(check({ toast: 1, scrambled: 1, fried: 1, sausage: 1 })).toEqual([]);
  });

  it('counts group units, not ingredients (Omelette x1 + Fried x3 = 4 units)', () => {
    expect(check({ toast: 1, omelette: 1, fried: 3, sausage: 1 })).toEqual([]);
  });

  it('reports every missing required group on an empty config', () => {
    expect(codes({})).toEqual(['groupRange:bread', 'groupRange:eggs', 'groupRange:protein']);
  });

  it('enforces max: two breads, four proteins', () => {
    expect(codes({ toast: 1, paratha: 1, scrambled: 2, sausage: 1 })).toEqual(['groupRange:bread']);
    expect(check({ toast: 1, paratha: 1, scrambled: 2, sausage: 1 })[0]?.message).toBe(
      'Bread total must be exactly 1 (you have 2)',
    );
    expect(codes({ toast: 1, scrambled: 2, sausage: 2, bacon: 2 })).toEqual(['groupRange:protein']);
  });

  it('enforces the base extras max of 4 without Croissant', () => {
    const config = { toast: 1, scrambled: 2, sausage: 1, hashbrown: 2, mushroom: 2, beans: 1 };
    expect(codes(config)).toEqual(['groupRange:extras']);
    expect(check(config)[0]?.message).toBe('Extras total must be at most 4 (you have 5)');
  });

  it('allows exactly 2 extras with Croissant', () => {
    expect(check({ croissant: 1, scrambled: 2, sausage: 1, hashbrown: 1, mushroom: 1 })).toEqual([]);
  });

  it('enforces maxPerOption and maxDistinct in the sauce group', () => {
    expect(codes({ toast: 1, scrambled: 2, sausage: 1, ketchup: 2 })).toEqual(['maxPerOption:sauce']);
    expect(codes({ toast: 1, scrambled: 2, sausage: 1, ketchup: 1, hollandaise: 1, chili: 1 })).toEqual([
      'maxDistinct:sauce',
      'excludes:R4',
    ]);
  });

  it('lists group and rule violations together', () => {
    expect(codes({ croissant: 1, fried: 3, tofu: 1, sausage: 1, hashbrown: 3, hollandaise: 1 })).toEqual([
      'groupRange:eggs',
      'overrideLimit:extras',
      'requires:R1',
      'excludes:R2',
    ]);
  });

  it('rejects negative, fractional and unknown quantities', () => {
    expect(codes({ ...ITEM_A, ketchup: -1 }).at(0)).toBe('invalidQuantity:sauce');
    expect(codes({ ...ITEM_A, ketchup: 0.5 }).at(0)).toBe('invalidQuantity:sauce');
    expect(check({ ...ITEM_A, pancake: 1 })[0]).toMatchObject({ code: 'unknownOption', optionId: 'pancake' });
  });

  it('does not mutate its inputs', () => {
    const config = Object.freeze({ ...ITEM_B });
    expect(() => validate(config, Object.freeze([...menu.groups]), Object.freeze([...menu.rules]))).not.toThrow();
  });
});

describe('validate with a different menu (data-driven)', () => {
  const groups: Group[] = [
    {
      id: 'size',
      name: 'Size',
      min: 1,
      max: 1,
      options: [
        { id: 'small', name: 'Small', price: 0, ingredients: {} },
        { id: 'large', name: 'Large', price: 0, ingredients: {} },
      ],
    },
    {
      id: 'shots',
      name: 'Shots',
      min: 0,
      max: 6,
      step: 3,
      options: [{ id: 'espresso', name: 'Espresso', price: 0, ingredients: {} }],
    },
  ];
  const rules: Rule[] = [
    { id: 'X1', type: 'overrideLimit', option: 'small', group: 'shots', max: 3 },
    { id: 'X2', type: 'overrideLimit', option: 'small', group: 'shots', max: 5 },
  ];

  it('applies step and the strictest active override to unknown groups', () => {
    expect(validate({ large: 1, espresso: 6 }, groups, rules)).toEqual([]);
    expect(validate({ large: 1, espresso: 4 }, groups, rules).map((v) => v.code)).toEqual(['groupRange']);
    expect(validate({ small: 1, espresso: 6 }, groups, rules)).toEqual([
      expect.objectContaining({ code: 'overrideLimit', ruleId: 'X1', message: 'Shots max is 3 when Small is selected (you have 6)' }),
    ]);
  });
});
