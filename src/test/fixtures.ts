import menuJson from '../mocks/fixture/menu.json';
import type { Config, Menu } from '../domain/types';

/** The Appendix A menu, typed. Tests only: the app gets it from the mock API. */
export const menu = menuJson as unknown as Menu;

// The three reference items from Section 9 (option ids as used in the seed file).
export const ITEM_A: Config = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 };
export const ITEM_B: Config = {
  croissant: 1,
  omelette: 2,
  fried: 2,
  sausage: 1,
  bacon: 1,
  hashbrown: 1,
  mushroom: 1,
  hollandaise: 1,
};
export const ITEM_C: Config = {
  paratha: 1,
  fried: 2,
  tofu: 1,
  cheese: 2,
  beans: 1,
  mushroom: 1,
  chili: 1,
};
