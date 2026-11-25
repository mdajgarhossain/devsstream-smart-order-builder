// Domain types shared by the engines, the mock server and the UI.
// Nothing here knows about specific options: every id comes from the menu data.

/** Money is always an integer number of poisha (1 BDT = 100 poisha). */
export type Poisha = number;

export type OptionId = string;
export type GroupId = string;
export type IngredientId = string;

export interface MenuOption {
  id: OptionId;
  name: string;
  price: Poisha;
  /** Units of each ingredient used by ONE unit of this option. */
  ingredients: Record<IngredientId, number>;
}

export interface Group {
  id: GroupId;
  name: string;
  /** Limits apply to the total units picked in the group. Missing = no limit. */
  min?: number;
  max?: number;
  step?: number;
  maxDistinct?: number;
  maxPerOption?: number;
  options: MenuOption[];
}

export interface RequiresRule {
  id: string;
  type: 'requires';
  option: OptionId;
  anyOf: OptionId[];
}

export interface ExcludesRule {
  id: string;
  type: 'excludes';
  option: OptionId;
  noneOf: OptionId[];
}

export interface OverrideLimitRule {
  id: string;
  type: 'overrideLimit';
  option: OptionId;
  group: GroupId;
  max: number;
}

export type Rule = RequiresRule | ExcludesRule | OverrideLimitRule;

export interface Ingredient {
  id: IngredientId;
  name: string;
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  basePrice: Poisha;
}

export interface Menu {
  currency: string;
  product: Product;
  groups: Group[];
  rules: Rule[];
  ingredients: Ingredient[];
  /** Allowed cart quantity per item, e.g. 1-3. */
  quantity: { min: number; max: number };
  reservationSeconds: number;
}

/** What the customer picked: option id -> units. Options with 0 may be omitted. */
export type Config = Record<OptionId, number>;

export type ViolationCode =
  | 'groupRange'
  | 'maxDistinct'
  | 'maxPerOption'
  | 'overrideLimit'
  | 'requires'
  | 'excludes'
  | 'invalidQuantity'
  | 'unknownOption';

export interface Violation {
  code: ViolationCode;
  /** Set when the problem is about a group's limits. */
  groupId?: GroupId;
  /** Set when the problem comes from a cross-group rule. */
  ruleId?: string;
  optionId?: OptionId;
  message: string;
}
