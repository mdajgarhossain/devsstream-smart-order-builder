import type { CartInput } from '../../domain/pricing';
import { PriceBreakdown } from './PriceBreakdown';
import { usePricePreview } from './usePricePreview';

interface PricePreviewProps {
  cart: CartInput | null;
  currency: string;
  vatPercent: number;
}

/** Price of the configuration being built, straight from the server's /price endpoint. */
export function PricePreview({ cart, currency, vatPercent }: PricePreviewProps) {
  const { state, retry } = usePricePreview(cart);

  return (
    <section className="price-preview" aria-label="Price" aria-live="polite">
      <h3>Price</h3>
      {state.status === 'idle' && <p className="muted">Pick options to see the price.</p>}
      {state.status === 'loading' && <p className="muted">Calculating price…</p>}
      {state.status === 'error' && (
        <p role="alert" className="error">
          {state.message}{' '}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {state.status === 'ready' && <PriceBreakdown price={state.price} currency={currency} vatPercent={vatPercent} />}
    </section>
  );
}
