import type { CartInput } from '../../domain/pricing';
import { PriceBreakdown } from './PriceBreakdown';
import { usePricePreview } from './usePricePreview';

interface PricePreviewProps {
  cart: CartInput | null;
  currency: string;
  vatPercent: number;
  title?: string;
  emptyText?: string;
}

/** Price straight from the server's /price endpoint (debounced, never stale). */
export function PricePreview({
  cart,
  currency,
  vatPercent,
  title = 'Price',
  emptyText = 'Pick options to see the price.',
}: PricePreviewProps) {
  const { state, retry } = usePricePreview(cart);

  return (
    <section className="price-preview" aria-label={title} aria-live="polite">
      <h3>{title}</h3>
      {state.status === 'idle' && <p className="muted">{emptyText}</p>}
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
