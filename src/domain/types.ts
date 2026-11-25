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

// Promotions. The engine knows these four *kinds*; which groups, amounts and
// codes they use comes from the menu data.

/** Per unit: for every `every` units in `group`, the cheapest unit is free. */
export interface FreeCheapestPerNPromo {
  id: string;
  name: string;
  type: 'freeCheapestPerN';
  group: GroupId;
  every: number;
}

/** Per unit: percent off when every condition (units in a group) is met. */
export interface ComboPercentPromo {
  id: string;
  name: string;
  type: 'comboPercent';
  conditions: { group: GroupId; minUnits: number }[];
  percent: number;
}

/** Cart: fixed amount off when the subtotal reaches a threshold. */
export interface CartThresholdPromo {
  id: string;
  name: string;
  type: 'cartThreshold';
  minSubtotal: Poisha;
  amountOff: Poisha;
}

/** Cart: coupon code, percent off with a cap, valid strictly before a local time. */
export interface CouponPromo {
  id: string;
  name: string;
  type: 'coupon';
  code: string;
  percent: number;
  cap: Poisha;
  validBefore: string;
  timeZone: string;
}

export type Promotion = FreeCheapestPerNPromo | ComboPercentPromo | CartThresholdPromo | CouponPromo;

export interface Menu {
  currency: string;
  /** The shop's time zone, used for showing dates and grouping orders by day. */
  timeZone: string;
  product: Product;
  groups: Group[];
  rules: Rule[];
  ingredients: Ingredient[];
  promotions: Promotion[];
  /** When two cart discounts are worth the same, the one listed first wins. */
  cartDiscountTieBreak: string[];
  vatPercent: number;
  /** Labels only, no payment data is collected. */
  paymentMethods: string[];
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
