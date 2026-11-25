import type { Config, Menu } from '../../domain/types';

/** "Croissant, Omelette ×2, Fried ×2, …" in menu order, names from the menu data. */
export function describeConfig(config: Config, menu: Menu): string {
  const parts: string[] = [];
  for (const group of menu.groups) {
    for (const option of group.options) {
      const units = config[option.id] ?? 0;
      if (units > 0) parts.push(units > 1 ? `${option.name} ×${units}` : option.name);
    }
  }
  return parts.join(', ');
}
