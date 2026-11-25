import { describe, expect, it } from 'vitest';
import { validate } from '../../domain/rules';
import { menu } from '../fixtures';
import type { Config } from '../../domain/types';

const check = (config: Config) => validate(config, menu.groups, menu.rules);

describe('Section 9 - Part A rules engine', () => {
  it('TC-01: Scrambled x3 is blocked by the eggs step', () => {
    const violations = check({ toast: 1, scrambled: 3, sausage: 1 });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ code: 'groupRange', groupId: 'eggs' });
    expect(violations[0]?.message).toMatch(/eggs total must be 2-6 in steps of 2/i);
  });

  it('TC-02: Croissant + 3 extras breaks the override (extras max 2)', () => {
    const violations = check({ croissant: 1, scrambled: 2, sausage: 1, hashbrown: 1, mushroom: 1, beans: 1 });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ code: 'overrideLimit', groupId: 'extras', ruleId: 'R3' });
    expect(violations[0]?.message).toMatch(/extras max is 2 when croissant is selected/i);
  });

  it('TC-03: Hollandaise with only Fried eggs is blocked', () => {
    const violations = check({ toast: 1, fried: 2, sausage: 1, hollandaise: 1 });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ code: 'requires', ruleId: 'R1' });
    expect(violations[0]?.message).toBe('Hollandaise requires Scrambled or Omelette');
  });

  it('TC-04: Tofu + Beef Bacon and Chili + Hollandaise are both listed', () => {
    const violations = check({ toast: 1, scrambled: 2, tofu: 1, bacon: 1, chili: 1, hollandaise: 1 });

    expect(violations.map((v) => [v.code, v.ruleId])).toEqual([
      ['excludes', 'R2'],
      ['excludes', 'R4'],
    ]);
    expect(violations[0]?.message).toBe('Tofu cannot be combined with Beef Bacon');
    expect(violations[1]?.message).toBe('Chili cannot be combined with Hollandaise');
  });
});
