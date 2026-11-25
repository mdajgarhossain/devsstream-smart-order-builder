import { ruleHeadroom } from './rules';
import { stockHeadroom, type Usage } from './stock';
import type { Config, Group, OptionId, Rule } from './types';

export interface OptionAvailability {
  /** Units that can still be added; 0 means the option should be disabled. */
  canAdd: number;
  /** What caps it, so the UI can explain why an option is disabled. */
  limitedBy: 'stock' | 'rule' | null;
}

/**
 * For every option: how many more units can be added right now.
 * It is the lower of what stock allows (shared with the cart) and what
 * the group limits allow.
 *
 * `available` is stock left after every OTHER cart allocation
 * (when editing an item, its own allocation is not subtracted).
 */
export function optionAvailability(
  config: Readonly<Config>,
  groups: readonly Group[],
  rules: readonly Rule[],
  available: Usage,
  qty = 1,
): Map<OptionId, OptionAvailability> {
  const result = new Map<OptionId, OptionAvailability>();
  for (const group of groups) {
    for (const option of group.options) {
      const byStock = stockHeadroom(option, config, groups, available, qty);
      const byRule = ruleHeadroom(config, option.id, group, rules);
      const canAdd = Math.min(byStock, byRule);
      let limitedBy: OptionAvailability['limitedBy'] = null;
      if (canAdd === 0) limitedBy = byStock === 0 ? 'stock' : 'rule';
      result.set(option.id, { canAdd, limitedBy });
    }
  }
  return result;
}
