import { useState } from 'react';
import { useMenu } from './features/builder/useMenu';
import { Workspace } from './features/cart/Workspace';
import { OrdersPanel } from './features/orders/OrdersPanel';

export function App() {
  const { state, reload } = useMenu();
  const [ordersVersion, setOrdersVersion] = useState(0);

  return (
    <main className="app">
      <h1>Smart Order Builder</h1>
      {state.status === 'loading' && <p className="muted">Loading menu…</p>}
      {state.status === 'error' && (
        <p role="alert" className="error">
          {state.message}{' '}
          <button type="button" onClick={reload}>
            Retry
          </button>
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <Workspace
            menu={state.menu}
            initialStock={state.stock}
            onOrderPlaced={() => setOrdersVersion((v) => v + 1)}
          />
          <OrdersPanel menu={state.menu} version={ordersVersion} />
        </>
      )}
    </main>
  );
}
