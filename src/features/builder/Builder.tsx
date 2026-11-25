import { useMemo, useState, type ReactNode } from 'react';
import { optionAvailability, type OptionAvailability } from '../../domain/availability';
import { formatBdt } from '../../domain/money';
import { validate } from '../../domain/rules';
import { checkStock, formatShortages, ingredientUsage, stockHeadroom, type Usage } from '../../domain/stock';
import type { CartInput } from '../../domain/pricing';
import type { Config, Group, Menu, MenuOption, OptionId } from '../../domain/types';
import { PricePreview } from '../pricing/PricePreview';
import { describeGroup } from './describeGroup';

interface BuilderProps {
  menu: Menu;
  /** Stock free for this configuration (for an edit, including the item's own allocation). */
  stock: Usage;
  /** Starting point when editing a cart item. */
  initial?: { config: Config; qty: number };
  title?: string;
  submitLabel?: string;
  /** A request is in flight: the submit button is disabled so repeat clicks do nothing. */
  pending?: boolean;
  onSubmit?: (config: Config, qty: number) => void;
  onCancel?: () => void;
  /** Server feedback shown under the button (shortages, failures, expiry). */
  notice?: ReactNode;
}

/**
 * The configurator. Everything it shows comes from `menu`: no option ids or limits live here.
 * Part A (validate) decides whether Add to Cart is allowed; Part B (stock) decides how many
 * more units each option can take and lists shortages.
 */
export function Builder({
  menu,
  stock,
  initial,
  title,
  submitLabel = 'Add to Cart',
  pending = false,
  onSubmit,
  onCancel,
  notice,
}: BuilderProps) {
  const [config, setConfig] = useState<Config>(() => initial?.config ?? {});
  const [qty, setQty] = useState(() => initial?.qty ?? menu.quantity.min);

  const violations = useMemo(() => validate(config, menu.groups, menu.rules), [config, menu]);
  const availability = useMemo(
    () => optionAvailability(config, menu.groups, menu.rules, stock, qty),
    [config, menu, stock, qty],
  );
  const stockCheck = useMemo(
    () => checkStock(menu.ingredients, stock, ingredientUsage(config, menu.groups, qty)),
    [config, menu, stock, qty],
  );
  const blocked = violations.length > 0 || !stockCheck.ok;

  // The price shown while configuring always comes from the server (/price), never computed here.
  const previewCart = useMemo<CartInput | null>(
    () => (Object.keys(config).length > 0 ? { lines: [{ config, qty }] } : null),
    [config, qty],
  );

  const setUnits = (optionId: OptionId, units: number) =>
    setConfig((prev) => {
      const next = { ...prev };
      if (units <= 0) delete next[optionId];
      else next[optionId] = units;
      return next;
    });

  // Single-choice groups (max 1) behave like radio buttons: picking one replaces the other.
  const choose = (group: Group, optionId: OptionId | null) =>
    setConfig((prev) => {
      const next = withoutGroup(prev, group);
      if (optionId) next[optionId] = 1;
      return next;
    });

  const quantities = range(menu.quantity.min, menu.quantity.max);

  return (
    <section className="builder" aria-label="Order builder">
      <header className="builder-header">
        <h2>{title ?? menu.product.name}</h2>
        <p className="muted">
          Base price {menu.currency} {formatBdt(menu.product.basePrice)}
        </p>
      </header>

      {menu.groups.map((group) => (
        <fieldset key={group.id} className="group">
          <legend>
            {group.name} <span className="muted">({describeGroup(group)})</span>
          </legend>
          {group.max === 1
            ? group.options.map((option) => {
                const selected = (config[option.id] ?? 0) > 0;
                const fits = stockHeadroom(option, withoutGroup(config, group), menu.groups, stock, qty) > 0;
                return (
                  <label key={option.id} className={`option${!fits && !selected ? ' is-disabled' : ''}`}>
                    <input
                      type="radio"
                      name={group.id}
                      checked={selected}
                      disabled={!fits && !selected}
                      onChange={() => choose(group, option.id)}
                    />
                    <span className="option-name">{option.name}</span>
                    <Price option={option} currency={menu.currency} />
                    <span className="hint">{!fits && !selected ? 'Out of stock' : ''}</span>
                  </label>
                );
              })
            : group.options.map((option) => {
                const units = config[option.id] ?? 0;
                const avail = availability.get(option.id) ?? { canAdd: 0, limitedBy: 'rule' };
                return (
                  <div key={option.id} className={`option${avail.canAdd === 0 && units === 0 ? ' is-disabled' : ''}`}>
                    <span className="option-name">{option.name}</span>
                    <Price option={option} currency={menu.currency} />
                    <span className="stepper">
                      <button
                        type="button"
                        aria-label={`Remove one ${option.name}`}
                        disabled={units === 0}
                        onClick={() => setUnits(option.id, units - 1)}
                      >
                        −
                      </button>
                      <output aria-label={`${option.name} units`}>{units}</output>
                      <button
                        type="button"
                        aria-label={`Add one ${option.name}`}
                        disabled={avail.canAdd === 0}
                        onClick={() => setUnits(option.id, units + 1)}
                      >
                        +
                      </button>
                    </span>
                    <span className="hint">{availabilityHint(avail)}</span>
                  </div>
                );
              })}
        </fieldset>
      ))}

      <div className="add-bar">
        <label>
          Quantity{' '}
          <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
            {quantities.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="actions">
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={blocked || pending}
            aria-busy={pending}
            onClick={() => onSubmit?.(config, qty)}
          >
            {submitLabel}
          </button>
        </span>
      </div>
      {pending && <p className="muted">Saving…</p>}
      {notice}

      {blocked ? (
        <ul className="issues" aria-label="Why this can't be added yet">
          {violations.map((v) => (
            <li key={`${v.code}:${v.groupId ?? ''}:${v.ruleId ?? ''}:${v.optionId ?? ''}`}>{v.message}</li>
          ))}
          {!stockCheck.ok && <li>{formatShortages(stockCheck.shortages)}</li>}
        </ul>
      ) : (
        <p className="ok">Looks good: ready to add.</p>
      )}

      <PricePreview cart={previewCart} currency={menu.currency} vatPercent={menu.vatPercent} />
    </section>
  );
}

function Price({ option, currency }: { option: MenuOption; currency: string }) {
  return (
    <span className="price">
      +{currency} {formatBdt(option.price)}
    </span>
  );
}

function availabilityHint({ canAdd, limitedBy }: OptionAvailability): string {
  if (canAdd === Infinity) return '';
  if (canAdd > 0) return `${canAdd} more`;
  return limitedBy === 'stock' ? 'Out of stock' : 'Limit reached';
}

function withoutGroup(config: Config, group: Group): Config {
  const next = { ...config };
  for (const option of group.options) delete next[option.id];
  return next;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}
