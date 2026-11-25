import type { Config, Group, MenuOption, OptionId } from './types';

export interface OptionEntry {
  option: MenuOption;
  group: Group;
}

/** Map every option id to the option and the group it belongs to. */
export function indexOptions(groups: readonly Group[]): Map<OptionId, OptionEntry> {
  const index = new Map<OptionId, OptionEntry>();
  for (const group of groups) {
    for (const option of group.options) {
      index.set(option.id, { option, group });
    }
  }
  return index;
}

/** Units of an option in the config (missing = 0). */
export function qtyOf(config: Config, optionId: OptionId): number {
  return config[optionId] ?? 0;
}

export function isSelected(config: Config, optionId: OptionId): boolean {
  return qtyOf(config, optionId) > 0;
}

/** Total units picked in a group, e.g. Omelette x1 + Fried x3 = 4 egg units. */
export function groupUnits(config: Config, group: Group): number {
  return group.options.reduce((sum, option) => sum + qtyOf(config, option.id), 0);
}

/** Human-readable option name, falling back to the id for unknown options. */
export function optionName(index: Map<OptionId, OptionEntry>, optionId: OptionId): string {
  return index.get(optionId)?.option.name ?? optionId;
}
