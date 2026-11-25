import { groupUnits, indexOptions, isSelected, optionName, qtyOf, type OptionEntry } from './menu';
import type { Config, Group, OptionId, OverrideLimitRule, Rule, Violation } from './types';

type OptionIndex = Map<OptionId, OptionEntry>;

/**
 * Check a configuration against group limits and cross-group rules.
 *
 * Pure and generic: it only reads the data it is given, never option ids of its own.
 * Returns every violation (empty array = valid), groups first, then rules,
 * each in menu order so the output is stable.
 */
export function validate(config: Readonly<Config>, groups: readonly Group[], rules: readonly Rule[]): Violation[] {
  const index = indexOptions(groups);
  return [
    ...checkQuantities(config, index),
    ...groups.flatMap((group) => checkGroup(config, group, rules, index)),
    ...rules.flatMap((rule) => checkRule(config, rule, index)),
  ];
}

function checkQuantities(config: Config, index: OptionIndex): Violation[] {
  const violations: Violation[] = [];
  for (const [optionId, qty] of Object.entries(config)) {
    if (!Number.isInteger(qty) || qty < 0) {
      violations.push({
        code: 'invalidQuantity',
        optionId,
        groupId: index.get(optionId)?.group.id,
        message: `${optionName(index, optionId)} quantity must be a whole number of 0 or more`,
      });
    } else if (qty > 0 && !index.has(optionId)) {
      violations.push({ code: 'unknownOption', optionId, message: `Unknown option "${optionId}"` });
    }
  }
  return violations;
}

/**
 * An overrideLimit rule replaces the group's max while its option is selected.
 * If several are active for one group, the strictest (lowest) max wins.
 */
function activeOverride(config: Config, group: Group, rules: readonly Rule[]): OverrideLimitRule | undefined {
  let winner: OverrideLimitRule | undefined;
  for (const rule of rules) {
    if (rule.type !== 'overrideLimit' || rule.group !== group.id) continue;
    if (!isSelected(config, rule.option)) continue;
    if (!winner || rule.max < winner.max) winner = rule;
  }
  return winner;
}

/**
 * How many more units of an option the group limits allow right now:
 * the lowest of maxPerOption, the (override-aware) group max, and maxDistinct.
 * Cross-group rules (requires/excludes) are reported by validate(), not here.
 */
export function ruleHeadroom(config: Readonly<Config>, optionId: OptionId, group: Group, rules: readonly Rule[]): number {
  const current = config[optionId] ?? 0;
  const override = activeOverride(config, group, rules);
  const max = override ? override.max : (group.max ?? Infinity);
  let headroom = max - groupUnits(config, group);

  if (group.maxPerOption !== undefined) {
    headroom = Math.min(headroom, group.maxPerOption - current);
  }
  if (group.maxDistinct !== undefined && current === 0) {
    const distinct = group.options.filter((option) => isSelected(config, option.id)).length;
    if (distinct >= group.maxDistinct) headroom = 0;
  }
  return Math.max(0, headroom);
}

function checkGroup(config: Config, group: Group, rules: readonly Rule[], index: OptionIndex): Violation[] {
  const violations: Violation[] = [];
  const total = groupUnits(config, group);
  const min = group.min ?? 0;
  const override = activeOverride(config, group, rules);
  const max = override ? override.max : (group.max ?? Infinity);

  const tooFew = total < min;
  const tooMany = total > max;
  const offStep = group.step !== undefined && group.step > 0 && total % group.step !== 0;

  if (tooMany && override) {
    violations.push({
      code: 'overrideLimit',
      groupId: group.id,
      ruleId: override.id,
      message: `${group.name} max is ${override.max} when ${optionName(index, override.option)} is selected (you have ${total})`,
    });
  }
  if (tooFew || offStep || (tooMany && !override)) {
    violations.push({
      code: 'groupRange',
      groupId: group.id,
      message: `${group.name} total must be ${describeRange(min, max, group.step)} (you have ${total})`,
    });
  }

  if (group.maxPerOption !== undefined) {
    for (const option of group.options) {
      if (qtyOf(config, option.id) > group.maxPerOption) {
        violations.push({
          code: 'maxPerOption',
          groupId: group.id,
          optionId: option.id,
          message: `${option.name} can be added at most ${group.maxPerOption} time(s)`,
        });
      }
    }
  }

  if (group.maxDistinct !== undefined) {
    const distinct = group.options.filter((option) => isSelected(config, option.id)).length;
    if (distinct > group.maxDistinct) {
      violations.push({
        code: 'maxDistinct',
        groupId: group.id,
        message: `${group.name}: pick at most ${group.maxDistinct} different options (you have ${distinct})`,
      });
    }
  }

  return violations;
}

function checkRule(config: Config, rule: Rule, index: OptionIndex): Violation[] {
  if (rule.type === 'overrideLimit' || !isSelected(config, rule.option)) return [];
  const name = optionName(index, rule.option);

  if (rule.type === 'requires') {
    if (rule.anyOf.some((id) => isSelected(config, id))) return [];
    const needed = rule.anyOf.map((id) => optionName(index, id)).join(' or ');
    return [{ code: 'requires', ruleId: rule.id, optionId: rule.option, message: `${name} requires ${needed}` }];
  }

  const conflicts = rule.noneOf.filter((id) => isSelected(config, id));
  if (conflicts.length === 0) return [];
  const names = conflicts.map((id) => optionName(index, id)).join(' or ');
  return [{ code: 'excludes', ruleId: rule.id, optionId: rule.option, message: `${name} cannot be combined with ${names}` }];
}

function describeRange(min: number, max: number, step?: number): string {
  let range: string;
  if (max === Infinity) range = `at least ${min}`;
  else if (min === max) range = `exactly ${min}`;
  else if (min === 0) range = `at most ${max}`;
  else range = `${min}-${max}`;
  return step ? `${range} in steps of ${step}` : range;
}
