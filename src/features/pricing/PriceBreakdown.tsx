import { formatBdt } from '../../domain/money';
import type { CartPrice, CouponStatus } from '../../domain/pricing';

interface PriceBreakdownProps {
  price: CartPrice;
  currency: string;
  vatPercent: number;
}

/** Full breakdown: each line's steps, subtotal, the cart discount, VAT and payable. */
export function PriceBreakdown({ price, currency, vatPercent }: PriceBreakdownProps) {
  const money = (amount: number) => `${currency} ${formatBdt(amount)}`;

  return (
    <dl className="breakdown">
      {price.lines.map((line, i) => (
        <div key={i} className="breakdown-line">
          <Row label="Base + options (per unit)" value={money(line.unitSubtotal)} />
          {line.unitDiscounts.map((d) => (
            <Row key={d.id} label={`${d.name} (${d.id})`} value={`−${money(d.amount)}`} discount />
          ))}
          <Row label="Unit price" value={money(line.unitPrice)} />
          <Row label={`× ${line.qty}`} value={money(line.lineTotal)} />
        </div>
      ))}
      <Row label="Subtotal" value={money(price.subtotal)} strong />
      {price.cartDiscount && (
        <Row label={`${price.cartDiscount.name} (${price.cartDiscount.id})`} value={`−${money(price.cartDiscount.amount)}`} discount />
      )}
      {price.coupon && !price.coupon.applied && <p className="note">{couponNote(price.coupon)}</p>}
      <Row label={`VAT ${vatPercent}%`} value={money(price.vat)} />
      <div className="breakdown-row payable">
        <dt>Payable</dt>
        <dd>
          <output aria-label="Payable">{money(price.payable)}</output>
        </dd>
      </div>
    </dl>
  );
}

function Row({ label, value, discount, strong }: { label: string; value: string; discount?: boolean; strong?: boolean }) {
  return (
    <div className={`breakdown-row${discount ? ' discount' : ''}${strong ? ' strong' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function couponNote(coupon: Extract<CouponStatus, { applied: false }>): string {
  switch (coupon.reason) {
    case 'unknown':
      return `Coupon ${coupon.code} is not a valid code.`;
    case 'expired':
      return `Coupon ${coupon.code} is not valid at this time.`;
    case 'notBest':
      return `Coupon ${coupon.code} not applied: another discount is bigger.`;
  }
}
