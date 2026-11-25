import type { CartItem } from '../../api/client';
import type { CartInput } from '../../domain/pricing';
import type { Menu } from '../../domain/types';
import { PricePreview } from '../pricing/PricePreview';
import { describeConfig } from './describeConfig';
import { isExpired } from './useCart';
import { formatCountdown } from './useServerNow';

interface CartPanelProps {
  menu: Menu;
  items: CartItem[];
  /** Server time (ms). */
  now: number;
  editingId: string | null;
  couponCode: string;
  onCouponChange: (code: string) => void;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export function CartPanel({ menu, items, now, editingId, couponCode, onCouponChange, onEdit, onRemove }: CartPanelProps) {
  const active = items.filter((item) => !isExpired(item, now));
  const priceInput: CartInput | null =
    active.length > 0 ? { lines: active.map(({ config, qty }) => ({ config, qty })), couponCode } : null;

  return (
    <section className="cart" aria-label="Cart">
      <h2>Cart</h2>
      {items.length === 0 && <p className="muted">Your cart is empty.</p>}
      <ul className="cart-items">
        {items.map((item, index) => {
          const expired = isExpired(item, now);
          return (
            <li key={item.id} className={`cart-item${expired ? ' is-expired' : ''}`} aria-label={`Cart item ${index + 1}`}>
              <div className="cart-item-main">
                <strong>
                  {item.qty} × {menu.product.name}
                </strong>
                <span className="muted">{describeConfig(item.config, menu)}</span>
              </div>
              <div className="cart-item-side">
                {expired ? (
                  <span className="expired-label">Expired · stock released</span>
                ) : (
                  <span className="countdown">
                    Reserved <output aria-label="Time left">{formatCountdown(item.expiresAt - now)}</output>
                  </span>
                )}
                <span className="actions">
                  {!expired && (
                    <button type="button" onClick={() => onEdit(item.id)} disabled={editingId === item.id}>
                      Edit
                    </button>
                  )}
                  <button type="button" onClick={() => onRemove(item.id)}>
                    Remove
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {items.length > 0 && (
        <>
          <label className="coupon">
            Coupon code{' '}
            <input value={couponCode} onChange={(e) => onCouponChange(e.target.value)} placeholder="e.g. MORNING15" />
          </label>
          <PricePreview
            cart={priceInput}
            currency={menu.currency}
            vatPercent={menu.vatPercent}
            title="Cart total"
            emptyText="No active items to price."
          />
        </>
      )}
    </section>
  );
}
